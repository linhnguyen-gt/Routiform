// Tool call helper functions for translator
import { createHash } from "node:crypto";

type JsonRecord = Record<string, unknown>;
type MessageBody = { messages?: JsonRecord[] } & JsonRecord;

const ALPHANUM9 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function stableToolIdHash(seed: unknown): string {
  return createHash("sha256").update(JSON.stringify(seed ?? null)).digest("hex");
}

function toBase62(hash: string, length: number): string {
  let out = "";
  for (let i = 0; out.length < length; i += 2) {
    const byteHex = hash.slice(i, i + 2) || hash.slice(0, 2) || "00";
    const byte = Number.parseInt(byteHex, 16) || 0;
    out += ALPHANUM9[byte % ALPHANUM9.length];
  }
  return out;
}

// Generate deterministic tool call ID (default long form)
export function generateToolCallId(seed?: unknown) {
  return `call_${stableToolIdHash(seed).slice(0, 16)}`;
}

// Generate deterministic tool_use style ID
export function generateToolUseId(seed?: unknown) {
  return `toolu_${stableToolIdHash(seed).slice(0, 16)}`;
}

// Generate deterministic 9-char [a-zA-Z0-9] id for providers that require it (e.g. Mistral)
export function generateToolCallId9(seed?: unknown): string {
  return toBase62(stableToolIdHash(seed), 9);
}

/** @param options.use9CharId - When true, normalize ids to 9-char [a-zA-Z0-9] (e.g. Mistral); when false, only fix type/arguments, leave ids as-is */
export function ensureToolCallIds(body: MessageBody, options?: { use9CharId?: boolean }) {
  if (!body.messages || !Array.isArray(body.messages)) return body;

  const use9CharId = options?.use9CharId === true;

  for (let i = 0; i < body.messages.length; i++) {
    const msg = body.messages[i];
    if (msg.role !== "assistant" || !msg.tool_calls || !Array.isArray(msg.tool_calls)) continue;

    const used9 = new Set<string>();
    const newIdsInOrder: string[] = [];

    for (let toolIndex = 0; toolIndex < msg.tool_calls.length; toolIndex++) {
      const tc = msg.tool_calls[toolIndex];
      if (!tc.type) {
        tc.type = "function";
      }
      if (tc.function?.arguments && typeof tc.function.arguments !== "string") {
        tc.function.arguments = JSON.stringify(tc.function.arguments);
      }

      const existingId = tc.id != null && String(tc.id).trim() !== "" ? String(tc.id) : "";
      const seed = {
        existingId,
        messageIndex: i,
        toolIndex,
        name: tc.function?.name ?? tc.name ?? "",
        arguments: tc.function?.arguments ?? "",
      };

      if (use9CharId) {
        let newId = generateToolCallId9(seed);
        while (used9.has(newId)) {
          newId = generateToolCallId9({ ...seed, collision: used9.size });
        }
        used9.add(newId);
        newIdsInOrder.push(newId);
        tc.id = newId;
      } else {
        const id = existingId || generateToolCallId(seed);
        tc.id = id;
        newIdsInOrder.push(id);
      }
    }

    // Tool responses (role "tool") follow in same order as tool_calls; set tool_call_id by index.
    // Stop when we hit another assistant so we only link tool messages that immediately follow this one.
    if (newIdsInOrder.length > 0) {
      let idx = 0;
      for (let j = i + 1; j < body.messages.length; j++) {
        const later = body.messages[j];
        if (later.role === "assistant") break;
        if (later.role !== "tool") continue;
        if (idx < newIdsInOrder.length) {
          later.tool_call_id = newIdsInOrder[idx];
          idx++;
        }
      }
    }
  }

  return body;
}

// Get tool_call ids from assistant message (OpenAI format: tool_calls, Claude format: tool_use in content)
export function getToolCallIds(msg: JsonRecord) {
  if (msg.role !== "assistant") return [];

  const ids: string[] = [];

  // OpenAI format: tool_calls array
  if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
    for (const tc of msg.tool_calls) {
      if (tc.id) ids.push(tc.id);
    }
  }

  // Claude format: tool_use blocks in content
  if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (block.type === "tool_use" && block.id) {
        ids.push(block.id);
      }
    }
  }

  return ids;
}

// Check if user message has tool_result for given ids (OpenAI format: role=tool, Claude format: tool_result in content)
export function hasToolResults(msg: JsonRecord | null | undefined, toolCallIds: string[]) {
  if (!msg || !toolCallIds.length) return false;

  // OpenAI format: role = "tool" with tool_call_id
  if (msg.role === "tool" && typeof msg.tool_call_id === "string") {
    return toolCallIds.includes(msg.tool_call_id);
  }

  // Claude format: tool_result blocks in user message content
  if (msg.role === "user" && Array.isArray(msg.content)) {
    for (const block of msg.content) {
      const toolUseId =
        block && typeof block === "object" && !Array.isArray(block)
          ? (block as JsonRecord).tool_use_id
          : undefined;
      if (
        block &&
        typeof block === "object" &&
        !Array.isArray(block) &&
        (block as JsonRecord).type === "tool_result" &&
        typeof toolUseId === "string" &&
        toolCallIds.includes(toolUseId)
      ) {
        return true;
      }
    }
  }

  return false;
}

// Fix missing tool responses - insert empty tool_result if assistant has tool_use but next message has no tool_result
export function fixMissingToolResponses(body: MessageBody) {
  if (!body.messages || !Array.isArray(body.messages)) return body;

  const newMessages: Array<Record<string, unknown>> = [];

  for (let i = 0; i < body.messages.length; i++) {
    const msg = body.messages[i];
    const nextMsg = body.messages[i + 1];

    newMessages.push(msg);

    // Check if this is assistant with tool_calls/tool_use
    const toolCallIds = getToolCallIds(msg);
    if (toolCallIds.length === 0) continue;

    // Check if next message has tool_result
    if (nextMsg && !hasToolResults(nextMsg, toolCallIds)) {
      // Insert tool responses for each tool_call
      for (const id of toolCallIds) {
        // OpenAI format: role = "tool"
        newMessages.push({
          role: "tool",
          tool_call_id: id,
          content: "",
        });
      }
    }
  }

  body.messages = newMessages;
  return body;
}
