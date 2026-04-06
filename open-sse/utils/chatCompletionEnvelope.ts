type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

/**
 * Cline / Gemini / proxies may wrap the completion in `{ data: { choices, ... } }` (sometimes nested).
 * Used by sanitization and empty-content detection so we do not drop real choices on the floor.
 */
export function unwrapOpenAIChatCompletionRoot(body: JsonRecord): JsonRecord {
  let current: JsonRecord = body;
  for (let depth = 0; depth < 4; depth++) {
    const data = current.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) break;
    const inner = asRecord(data);
    if (
      Array.isArray(inner.choices) ||
      inner.object === "chat.completion" ||
      (typeof inner.id === "string" && inner.id.startsWith("chatcmpl"))
    ) {
      current = inner;
      continue;
    }
    break;
  }
  return current;
}
