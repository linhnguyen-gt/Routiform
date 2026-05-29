import { asRecord } from "./json-utils";

type JsonRecord = Record<string, unknown>;

function toPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function firstPositiveNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const next = toPositiveNumber(value);
    if (next !== undefined) return next;
  }
  return undefined;
}

function getNestedRecord(value: unknown, key: string): JsonRecord {
  return asRecord(asRecord(value)[key]);
}

function normalizeSingleListedModel(model: unknown): JsonRecord {
  const record = asRecord(model);
  const limits = getNestedRecord(record, "limits");
  const topProvider = getNestedRecord(record, "top_provider");
  const conversationConfig = getNestedRecord(record, "conversationConfig");
  const conversationConfigSnake = getNestedRecord(record, "conversation_config");

  const inputTokenLimit = firstPositiveNumber(
    record.inputTokenLimit,
    record.input_token_limit,
    record.context_length,
    record.contextLength,
    record.max_context_length,
    record.maxContextLength,
    record.context_window,
    limits.max_context_length,
    limits.context_length,
    conversationConfig.contextLength,
    conversationConfigSnake.context_length
  );

  const outputTokenLimit = firstPositiveNumber(
    record.outputTokenLimit,
    record.output_token_limit,
    record.max_output_tokens,
    record.maxOutputTokens,
    record.max_completion_tokens,
    record.maxCompletionTokens,
    topProvider.max_completion_tokens,
    limits.max_completion_tokens,
    limits.max_output_tokens,
    conversationConfig.maxOutputTokens,
    conversationConfigSnake.max_output_tokens
  );

  return {
    ...record,
    ...(inputTokenLimit !== undefined ? { inputTokenLimit } : {}),
    ...(outputTokenLimit !== undefined ? { outputTokenLimit } : {}),
  };
}

export function normalizeProviderListedModels(models: unknown[]): JsonRecord[] {
  return models.map((model) => normalizeSingleListedModel(model));
}
