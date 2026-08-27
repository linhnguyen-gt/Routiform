import { createHash, randomUUID } from "node:crypto";

import { signRequestBody } from "../claudeCodeCCH.ts";
import {
  enforceThinkingTemperature,
  disableThinkingIfToolChoiceForced,
  enforceCacheControlLimit,
  ensureCacheControlOnLastUserMessage,
} from "../claudeCodeConstraints.ts";
import { obfuscateInBody } from "../claudeCodeObfuscation.ts";
import { remapToolNamesInRequest } from "../claudeCodeToolRemapper.ts";
import { buildBillingHeader } from "./billing.ts";
import { prepareClaudeCodeCompatibleBody } from "./claude-input.ts";
import {
  buildClaudeCodeCompatibleHeaders,
  resolveClaudeCodeCompatibleSessionId,
} from "./headers.ts";
import {
  buildClaudeCodeCompatibleMessages,
  buildClaudeCodeCompatibleMessagesFromClaude,
} from "./messages.ts";
import {
  resolveClaudeCodeCompatibleEffort,
  resolveClaudeCodeCompatibleMaxTokens,
} from "./params.ts";
import type { MessageLike } from "./shared.ts";
import { buildClaudeCodeCompatibleSystemBlocks } from "./system.ts";
import {
  buildClaudeCodeCompatibleToolChoice,
  buildClaudeCodeCompatibleTools,
  buildClaudeCodeCompatibleToolsFromClaude,
} from "./tools.ts";

export type BuildRequestOptions = {
  sourceBody?: Record<string, unknown> | null;
  normalizedBody?: Record<string, unknown> | null;
  claudeBody?: Record<string, unknown> | null;
  model: string;
  stream?: boolean;
  cwd?: string;
  now?: Date;
  sessionId?: string | null;
  preserveCacheControl?: boolean;
};

export function buildClaudeCodeCompatibleValidationPayload(model = "claude-sonnet-4-20250514") {
  const sessionId = randomUUID();
  return buildClaudeCodeCompatibleRequest({
    sourceBody: { max_tokens: 1 },
    normalizedBody: {
      messages: [{ role: "user", content: "ok" }],
      max_tokens: 1,
    },
    model,
    stream: true,
    sessionId,
    cwd: process.cwd(),
    now: new Date(),
  });
}

export function buildClaudeCodeCompatibleRequest({
  sourceBody,
  normalizedBody,
  claudeBody,
  model,
  stream = false,
  cwd = process.cwd(),
  now = new Date(),
  sessionId,
  preserveCacheControl = false,
}: BuildRequestOptions) {
  const normalized = normalizedBody || {};
  const preparedClaudeBody = claudeBody
    ? prepareClaudeCodeCompatibleBody(claudeBody, preserveCacheControl)
    : null;
  const messages = preparedClaudeBody
    ? buildClaudeCodeCompatibleMessagesFromClaude(
        preparedClaudeBody.messages as MessageLike[],
        preserveCacheControl
      )
    : Array.isArray(normalized.messages)
      ? buildClaudeCodeCompatibleMessages(normalized.messages as MessageLike[])
      : [];
  const allMessages = (preparedClaudeBody?.messages || normalized.messages || []) as Array<{
    role?: string;
    content?: unknown;
  }>;
  const billingHeader = buildBillingHeader(allMessages);
  const system = buildClaudeCodeCompatibleSystemBlocks({
    messages: normalized.messages as MessageLike[],
    systemBlocks: preparedClaudeBody?.system as Record<string, unknown>[] | undefined,
    cwd,
    now,
    preserveCacheControl,
    billingHeader,
  });
  const resolvedSessionId = sessionId || randomUUID();
  const effort = resolveClaudeCodeCompatibleEffort(sourceBody, normalizedBody, model);
  const maxTokens = resolveClaudeCodeCompatibleMaxTokens(sourceBody, normalizedBody);
  const tools = preparedClaudeBody?.tools
    ? buildClaudeCodeCompatibleToolsFromClaude(
        preparedClaudeBody.tools as Record<string, unknown>[],
        preserveCacheControl
      )
    : buildClaudeCodeCompatibleTools(normalizedBody, sourceBody);
  const toolChoice =
    tools.length > 0
      ? buildClaudeCodeCompatibleToolChoice(
          normalizedBody?.["tool_choice"] ?? sourceBody?.["tool_choice"]
        )
      : undefined;

  const built = {
    model,
    messages,
    system,
    tools,
    metadata: {
      user_id: JSON.stringify({
        device_id: createHash("sha256")
          .update(String(cwd || ""))
          .digest("hex")
          .slice(0, 24),
        account_uuid: "",
        session_id: resolvedSessionId,
      }),
    },
    max_tokens: maxTokens,
    thinking: {
      type: "adaptive",
    },
    context_management: {
      edits: [
        {
          type: "clear_thinking_20251015",
          keep: "all",
        },
      ],
    },
    output_config: {
      effort,
    },
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
    ...(stream ? { stream: true } : {}),
  };

  // Non-Anthropic Claude-compatible upstreams reject Anthropic-only keys (#1719 parity).
  const oc = built.output_config as Record<string, unknown> | undefined;
  if (oc && typeof oc.format !== "undefined") {
    delete oc.format;
  }

  return built;
}

/**
 * Full Claude Code request processing pipeline.
 *
 * Applies all mechanisms that real Claude Code uses:
 * 1. Build base request (system prompt, billing header, messages, tools)
 * 2. Remap tool names to TitleCase
 * 3. Enforce thinking temperature constraint (temp=1)
 * 4. Disable thinking when tool_choice forces a specific tool
 * 5. Enforce 4-block cache_control limit
 * 6. Auto-inject cache_control on last user message
 * 7. Obfuscate sensitive words in user messages
 * 8. Serialize with CCH placeholder
 * 9. Sign body with xxHash64 CCH attestation
 *
 * Returns { bodyString, headers } ready to send upstream.
 */
export async function buildAndSignClaudeCodeRequest(
  options: BuildRequestOptions & { apiKey: string; enableObfuscation?: boolean }
): Promise<{ bodyString: string; headers: Record<string, string> }> {
  const { apiKey, enableObfuscation = false, ...buildOptions } = options;

  // Step 1: Build base request
  const body = buildClaudeCodeCompatibleRequest(buildOptions);

  // Step 2: Remap tool names
  remapToolNamesInRequest(body);

  // Step 3-4: Thinking constraints
  enforceThinkingTemperature(body);
  disableThinkingIfToolChoiceForced(body);

  // Step 5-6: Cache control
  enforceCacheControlLimit(body);
  ensureCacheControlOnLastUserMessage(body);

  // Step 7: Obfuscation (optional, per-provider setting)
  if (enableObfuscation) {
    obfuscateInBody(body);
  }

  // Step 8: Serialize with CCH placeholder
  const serialized = JSON.stringify(body);

  // Step 9: Sign with xxHash64
  const bodyString = await signRequestBody(serialized);

  // Build headers
  const sessionId = options.sessionId || resolveClaudeCodeCompatibleSessionId();
  const headers = buildClaudeCodeCompatibleHeaders(apiKey, options.stream ?? false, sessionId);

  return { bodyString, headers };
}
