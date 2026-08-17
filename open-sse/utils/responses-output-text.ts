/**
 * Recovering the assistant's reply from a Responses-API stream.
 *
 * Codex's `response.completed` event carries an empty `output` and delivers the reply through
 * `response.output_text.delta` alone. Any code that rebuilds a non-streaming response by taking
 * `response.output` verbatim therefore throws the text away: the client gets a well-formed
 * completion with empty content, which reads as "the model said nothing" rather than as a
 * failure — and downstream quality gates reject it as if the provider had misbehaved.
 *
 * Both rebuild paths (the response the client receives, and the payload snapshot written to the
 * call log) share this rule so they cannot drift apart again.
 */

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

/** The Responses-API output item a plain assistant reply arrives as. */
export function assistantMessageOutputItem(text: string): JsonRecord {
  return {
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text }],
  };
}

/**
 * True when `output` already carries the assistant's reply.
 *
 * Reasoning and tool-call items do not count: a response can be full of them and still owe
 * the caller its text.
 */
export function outputCarriesAssistantText(output: unknown[]): boolean {
  return output.some((item) => {
    const record = asRecord(item);
    if (record.type !== "message") return false;
    const parts = Array.isArray(record.content) ? record.content : [];
    return parts.some((part) => {
      const partRecord = asRecord(part);
      return partRecord.type === "output_text" && typeof partRecord.text === "string"
        ? partRecord.text.length > 0
        : false;
    });
  });
}

/**
 * Fill the gap only. An output that already carries the reply wins, so a provider that does
 * populate `output` is unaffected, and reasoning or tool-call items already present are kept
 * either way.
 */
export function mergeStreamedTextIntoOutput(output: unknown, streamedText: string): unknown[] {
  const items = Array.isArray(output) ? output : [];
  if (!streamedText || outputCarriesAssistantText(items)) return items;
  return [...items, assistantMessageOutputItem(streamedText)];
}

/** Concatenated `response.output_text.delta` payloads, in arrival order. */
export function collectResponsesStreamedText(payloads: readonly unknown[]): string {
  const parts: string[] = [];
  for (const raw of payloads) {
    const payload = asRecord(raw);
    if (payload.type !== "response.output_text.delta") continue;
    if (typeof payload.delta === "string" && payload.delta.length > 0) parts.push(payload.delta);
  }
  return parts.join("");
}
