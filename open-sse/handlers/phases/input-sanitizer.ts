import {
  DEFAULT_MEMORY_SETTINGS,
  getMemorySettings,
  toMemoryRetrievalConfig,
} from "../../../src/lib/memory/settings.ts";
import { injectMemory, shouldInjectMemory } from "../../../src/lib/memory/injection.ts";
import { retrieveMemories } from "../../../src/lib/memory/retrieval.ts";
import { maybeEnforceMediaToolForLocalImage } from "../../services/imageToolRouting.ts";
import { maybeEnforceRequiredToolChoiceForUrlFetch } from "../../services/urlToolEnforcement.ts";

/**
 * Input sanitization phase handler
 * Extracted from chatCore.ts for better modularity
 */

/**
 * Sanitizes and normalizes request input before processing
 * - Strips empty name fields from messages/input/tools
 * - Enforces media tools for local images
 * - Enforces required tool choice for URL fetches
 * - Downgrades tool_choice for specific providers
 * - Injects memory if enabled
 *
 * @param body - Request body to sanitize (modified in place)
 * @param provider - Provider name
 * @param apiKeyInfo - API key information for memory injection
 * @param log - Logger instance
 * @returns Sanitized body
 */
export async function sanitizeRequestInput(
  body: Record<string, unknown>,
  provider: string,
  apiKeyInfo: { id?: string; name?: string } | null,
  log?: {
    info?: (category: string, message: string) => void;
    debug?: (category: string, message: string) => void;
  }
): Promise<Record<string, unknown>> {
  // #291: Strip empty name fields from messages/input items
  // Upstream providers (OpenAI, Codex) reject name:"" with 400 errors.
  if (Array.isArray(body.messages)) {
    body.messages = body.messages.map((msg: Record<string, unknown>) => {
      if (msg.name === "") {
        const { name: _n, ...rest } = msg;
        return rest;
      }
      return msg;
    });
  }
  if (Array.isArray(body.input)) {
    body.input = body.input.map((item: Record<string, unknown>) => {
      if (item.name === "") {
        const { name: _n, ...rest } = item;
        return rest;
      }
      return item;
    });
  }
  // #346/#637: Strip tools with empty name
  // Clients sometimes forward tool definitions with empty names, causing
  // upstream providers to reject with 400 "Invalid 'tools[0].name': empty string."
  if (Array.isArray(body.tools)) {
    const filteredTools = body.tools.filter((tool: Record<string, unknown>) => {
      // Built-in Responses API tool types are identified solely by `type` and carry no name.
      // Preserve only known built-ins here so unknown nameless tool types are still filtered.
      const toolType = typeof tool.type === "string" ? tool.type : "";
      const builtInResponsesToolTypes = new Set([
        "web_search",
        "web_search_preview",
        "file_search",
        "computer",
        "code_interpreter",
        "image_generation",
      ]);
      if (toolType && builtInResponsesToolTypes.has(toolType) && !tool.function) {
        return true;
      }

      const fn = tool.function as Record<string, unknown> | undefined;
      const name = fn?.name ?? tool.name;
      return name && String(name).trim().length > 0;
    }) as Record<string, unknown>[];

    // Normalize empty-string names in tools to undefined (do not drop built-ins)
    body.tools = filteredTools.map((tool: Record<string, unknown>) => {
      if (tool.name === "") {
        const { name: _n, ...rest } = tool;
        return rest;
      }
      const fn = tool.function as Record<string, unknown> | undefined;
      if (fn && fn.name === "") {
        return {
          ...tool,
          function: { ...fn, name: undefined },
        };
      }
      return tool;
    });
  }

  // Cline often returns empty 200 responses on forced local-image tool routing.
  // Keep this enforcement for other providers, but skip for Cline.
  if (provider !== "cline" && maybeEnforceMediaToolForLocalImage(body)) {
    log?.info?.("TOOLS", "Enforced image-reading tool for local image analysis request");
  }

  if (maybeEnforceRequiredToolChoiceForUrlFetch(body)) {
    log?.info?.("TOOLS", "Enforced tool_choice=required for URL fetch request");
  }

  // Qwen/Kiro/Cline often reject tool_choice="required" and named tool_choice objects
  // on thinking/tool streams. Keep tool usage enabled but let upstream choose automatically.
  if (
    (provider === "qwen" || provider === "kiro" || provider === "cline") &&
    (body.tool_choice === "required" ||
      (body.tool_choice &&
        typeof body.tool_choice === "object" &&
        !Array.isArray(body.tool_choice)))
  ) {
    body.tool_choice = "auto";
    log?.info?.(
      "TOOLS",
      `Downgraded tool_choice to auto for ${provider} thinking-mode compatibility`
    );
  }

  const memorySettings = apiKeyInfo?.id
    ? await getMemorySettings().catch(() => DEFAULT_MEMORY_SETTINGS)
    : null;

  if (
    apiKeyInfo?.id &&
    memorySettings &&
    shouldInjectMemory(body as Parameters<typeof shouldInjectMemory>[0], {
      enabled: memorySettings.enabled && memorySettings.maxTokens > 0,
    })
  ) {
    try {
      const memories = await retrieveMemories(
        apiKeyInfo.id,
        toMemoryRetrievalConfig(memorySettings)
      );
      if (memories.length > 0) {
        const injected = injectMemory(
          body as Parameters<typeof injectMemory>[0],
          memories,
          provider
        );
        body = injected as typeof body;
        log?.debug?.("MEMORY", `Injected ${memories.length} memories for key=${apiKeyInfo.id}`);
      }
    } catch (memErr) {
      log?.debug?.(
        "MEMORY",
        `Memory injection skipped: ${memErr instanceof Error ? memErr.message : String(memErr)}`
      );
    }
  }

  return body;
}
