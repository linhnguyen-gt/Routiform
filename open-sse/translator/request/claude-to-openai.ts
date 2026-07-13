import { register } from "../registry.ts";
import { FORMATS } from "../formats.ts";
import { adjustMaxTokens } from "../helpers/maxTokensHelper.ts";

type JsonRecord = Record<string, unknown>;
const TOOL_CHOICE_ANY = ["a", "n", "y"].join("");
const CLAUDE_OAUTH_TOOL_PREFIX = "proxy_";

function normalizeToolName(name: unknown): string {
  const raw = typeof name === "string" ? name.trim() : "";
  if (!raw) return "";
  if (raw.startsWith(CLAUDE_OAUTH_TOOL_PREFIX) && raw.length > CLAUDE_OAUTH_TOOL_PREFIX.length) {
    return raw.slice(CLAUDE_OAUTH_TOOL_PREFIX.length);
  }
  return raw;
}

// Convert Claude request to OpenAI format
export function claudeToOpenAIRequest(model, body, stream) {
  const result: {
    model: string;
    messages: JsonRecord[];
    stream: unknown;
    [key: string]: unknown;
  } = {
    model: model,
    messages: [],
    stream: stream,
  };

  // Max tokens
  if (body.max_tokens) {
    result.max_tokens = adjustMaxTokens(body);
  }

  // Temperature
  if (body.temperature !== undefined) {
    result.temperature = body.temperature;
  }

  // System message
  if (body.system) {
    const systemContent = Array.isArray(body.system)
      ? body.system.map((s) => s.text || "").join("\n")
      : body.system;

    if (systemContent) {
      result.messages.push({
        role: "system",
        content: systemContent,
      });
    }
  }

  // Convert messages
  if (body.messages && Array.isArray(body.messages)) {
    for (let i = 0; i < body.messages.length; i++) {
      const msg = body.messages[i];
      const isTrailingSystem = msg.role === "system" && i === body.messages.length - 1;
      const converted = convertClaudeMessage(msg, isTrailingSystem);
      if (converted) {
        // Handle array of messages (multiple tool results)
        if (Array.isArray(converted)) {
          result.messages.push(...converted);
        } else {
          result.messages.push(converted);
        }
      }
    }
  }

  // Fix missing tool responses - OpenAI requires every tool_call to have a response
  fixMissingToolResponses(result.messages);

  // Tools
  if (body.tools && Array.isArray(body.tools)) {
    const normalizedTools = body.tools
      .map((tool) => {
        const name = normalizeToolName(tool.name);
        if (!name) return null; // skip tools with empty/invalid name

        return {
          type: "function",
          function: {
            name,
            description: typeof tool.description === "string" ? tool.description : "", // fix: never null (#276)
            parameters: tool.input_schema || { type: "object", properties: {} },
          },
        };
      })
      .filter(
        (
          tool
        ): tool is {
          type: "function";
          function: { name: string; description: string; parameters: unknown };
        } => Boolean(tool)
      );

    if (normalizedTools.length > 0) {
      result.tools = normalizedTools;
    }
  }

  // Tool choice
  if (body.tool_choice) {
    result.tool_choice = convertToolChoice(body.tool_choice);
  }

  return result;
}

// Fix missing tool responses - add empty responses for tool_calls without responses
function fixMissingToolResponses(messages) {
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
      const toolCallIds = msg.tool_calls.map((tc) => tc.id);

      // Collect all tool response IDs that IMMEDIATELY follow this assistant message
      const respondedIds = new Set();
      let insertPosition = i + 1;
      for (let j = i + 1; j < messages.length; j++) {
        const nextMsg = messages[j];
        if (nextMsg.role === "tool" && nextMsg.tool_call_id) {
          respondedIds.add(nextMsg.tool_call_id);
          insertPosition = j + 1;
        } else {
          break;
        }
      }

      // Find missing responses and insert them
      const missingIds = toolCallIds.filter((id) => !respondedIds.has(id));

      if (missingIds.length > 0) {
        const missingResponses = missingIds.map((id) => ({
          role: "tool",
          tool_call_id: id,
          content: "[No response received]",
        }));
        messages.splice(insertPosition, 0, ...missingResponses);
        i = insertPosition + missingResponses.length - 1;
      }
    }
  }
}

// Wrap the TRAILING system message so it lands as a user turn instead of
// collapsing into assistant. Claude Code appends a single role:"system"
// message at the end of messages[]; unwrapped, that message previously
// mapped to "assistant", leaving the conversation ending on an assistant
// turn — OpenAI-compat providers that reverse-translate to Anthropic
// (LiteLLM et al.) then return 400 "assistant message prefill".
//
// This is scoped to the trailing message only (see isTrailingSystem in
// claudeToOpenAIRequest). Applying it to every system message regardless of
// position broke role alternation for mid-conversation system messages
// (e.g. [user, system, user] -> [user, user, user]) which some of the same
// reverse-translating backends reject, and could silently drop non-text
// blocks or the whole message on empty text.
function systemReminderText(content: unknown): string {
  const parts = Array.isArray(content)
    ? (content as JsonRecord[])
        .filter((c) => c?.type === "text")
        .map((c) => (typeof c.text === "string" ? c.text : ""))
    : [typeof content === "string" ? content : ""];
  const text = parts.filter(Boolean).join("\n");
  if (!text.trim()) return "";
  return `<system-reminder>\n${text}\n</system-reminder>`;
}

// Build the trailing-system-message replacement, preserving image blocks
// (which systemReminderText's text-only extraction would otherwise drop)
// instead of letting the message vanish when it carries non-text content.
function buildTrailingSystemMessage(content: unknown): JsonRecord | null {
  const blocks = Array.isArray(content) ? (content as JsonRecord[]) : [];
  const imageParts: JsonRecord[] = [];
  for (const block of blocks) {
    if (block?.type !== "image") continue;
    const source = block.source as JsonRecord | undefined;
    if (source?.type === "base64") {
      imageParts.push({
        type: "image_url",
        image_url: { url: `data:${source.media_type};base64,${source.data}` },
      });
    } else if (source?.type === "url" && typeof source.url === "string") {
      imageParts.push({ type: "image_url", image_url: { url: source.url } });
    }
  }

  const text = systemReminderText(content);

  if (imageParts.length === 0) {
    return text ? { role: "user", content: text } : null;
  }

  const parts: JsonRecord[] = [...imageParts];
  if (text) parts.push({ type: "text", text });
  return { role: "user", content: parts };
}

// Convert single Claude message - returns single message or array of messages.
// `isTrailingSystem` marks the single trailing role:"system" message Claude
// Code appends (see buildTrailingSystemMessage above); every other system
// message (mid-conversation) passes through as role "system" unchanged so
// its content — including non-text blocks — is preserved via the generic
// block-processing path below instead of being dropped or remapped.
function convertClaudeMessage(msg, isTrailingSystem = false) {
  if (msg.role === "system" && isTrailingSystem) {
    return buildTrailingSystemMessage(msg.content);
  }

  const role =
    msg.role === "system"
      ? "system"
      : msg.role === "user" || msg.role === "tool"
        ? "user"
        : "assistant";

  // Simple string content
  if (typeof msg.content === "string") {
    return { role, content: msg.content };
  }

  // Array content
  if (Array.isArray(msg.content)) {
    const parts = [];
    const toolCalls = [];
    const toolResults = [];

    for (const block of msg.content) {
      switch (block.type) {
        case "text":
          parts.push({ type: "text", text: block.text });
          break;

        case "image":
          if (block.source?.type === "base64") {
            parts.push({
              type: "image_url",
              image_url: {
                url: `data:${block.source.media_type};base64,${block.source.data}`,
              },
            });
          } else if (block.source?.type === "url" && typeof block.source.url === "string") {
            parts.push({
              type: "image_url",
              image_url: {
                url: block.source.url,
              },
            });
          }
          break;

        case "tool_use":
          {
            const normalizedName = normalizeToolName(block.name);
            if (!normalizedName) break;
            toolCalls.push({
              id: block.id,
              type: "function",
              function: {
                name: normalizedName,
                arguments: JSON.stringify(block.input || {}),
              },
            });
          }
          break;

        case "tool_result":
          let resultContent = "";
          if (typeof block.content === "string") {
            resultContent = block.content;
          } else if (Array.isArray(block.content)) {
            resultContent =
              block.content
                .filter((c) => c.type === "text")
                .map((c) => c.text)
                .join("\n") || JSON.stringify(block.content);
          } else if (block.content) {
            resultContent = JSON.stringify(block.content);
          }

          toolResults.push({
            role: "tool",
            tool_call_id: block.tool_use_id,
            content: resultContent,
          });
          break;

        case "thinking":
        case "redacted_thinking":
          break;

        case "server_tool_use":
          {
            const normalizedName = normalizeToolName(block.name);
            if (!normalizedName) break;
            toolCalls.push({
              id: block.id,
              type: "function",
              function: {
                name: normalizedName,
                arguments: JSON.stringify(block.input || {}),
              },
            });
          }
          break;
      }
    }

    // If has tool results, return array of tool messages
    if (toolResults.length > 0) {
      if (parts.length > 0) {
        const textContent = parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts;
        return [...toolResults, { role: "user", content: textContent }];
      }
      return toolResults;
    }

    // If has tool calls, return assistant message with tool_calls
    if (toolCalls.length > 0) {
      const result: JsonRecord = { role: "assistant" };
      if (parts.length > 0) {
        result.content = parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts;
      }
      result.tool_calls = toolCalls;
      return result;
    }

    // Return content
    if (parts.length > 0) {
      return {
        role,
        content: parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts,
      };
    }

    // Empty content array
    if (msg.content.length === 0) {
      return { role, content: "" };
    }

    // Had blocks but none mapped to parts/tools (e.g. only unknown types) — keep turn
    // so downstream OpenAI→Kiro conversion does not drop alternating roles.
    return { role, content: "" };
  }

  return null;
}

// Convert tool choice
function convertToolChoice(choice) {
  if (!choice) return "auto";
  if (typeof choice === "string") return choice;

  switch (choice.type) {
    case "auto":
      return "auto";
    case TOOL_CHOICE_ANY:
      return "required";
    case "tool":
      return { type: "function", function: { name: normalizeToolName(choice.name) } };
    default:
      return "auto";
  }
}

// Register
register(FORMATS.CLAUDE, FORMATS.OPENAI, claudeToOpenAIRequest, null);
