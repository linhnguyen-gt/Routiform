import { toNumber, toRecord, toString } from "./shared.ts";
import type { JsonRecord } from "./shared.ts";

/**
 * Translate a Devin payload into an OpenAI chat.completion payload.
 */
export function translateDevinToOpenAI(responseBody: unknown): JsonRecord {
  const root = toRecord(responseBody);
  const textContent = toString(root.output_text ?? root.text ?? root.content, "");
  const model = toString(root.model, "devin");
  const created = toNumber(root.created, Math.floor(Date.now() / 1000));
  const finishReason = toString(root.finish_reason, "stop");
  const usage = toRecord(root.usage);

  const result: JsonRecord = {
    id: `chatcmpl-${toString(root.id, String(Date.now()))}`,
    object: "chat.completion",
    created,
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: textContent,
        },
        finish_reason: finishReason,
      },
    ],
  };

  if (Object.keys(usage).length > 0) {
    result.usage = {
      prompt_tokens: toNumber(usage.prompt_tokens, 0),
      completion_tokens: toNumber(usage.completion_tokens, 0),
      total_tokens: toNumber(
        usage.total_tokens,
        toNumber(usage.prompt_tokens, 0) + toNumber(usage.completion_tokens, 0)
      ),
    };
  }

  return result;
}
