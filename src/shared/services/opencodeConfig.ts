type OpenCodeConfigInput = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  models?: string[];
  /** Map of model id → context window size in tokens */
  modelContextLengths?: Record<string, number>;
  /** Map of model id → max output tokens */
  modelMaxOutputTokens?: Record<string, number>;
};

const normalizeValue = (value: unknown) =>
  String(value || "")
    .trim()
    .replace(/^\/+/, "");

const OPENCODE_PROVIDER_KEY = "routiform";

/**
 * OpenCode expects `model` at the root of opencode.json, e.g. `routiform/alias/model-id`
 * (same prefix as the `provider` entry key). See OpenCode + @ai-sdk/anthropic docs.
 */
export function toOpenCodeModelRef(model: string | undefined | null): string | undefined {
  const v = normalizeValue(model);
  if (!v) return undefined;
  if (v.startsWith(`${OPENCODE_PROVIDER_KEY}/`)) return v;
  return `${OPENCODE_PROVIDER_KEY}/${v}`;
}

export const buildOpenCodeProviderConfig = ({
  baseUrl,
  apiKey,
  model,
  models,
  modelContextLengths,
  modelMaxOutputTokens,
}: OpenCodeConfigInput): Record<string, unknown> => {
  const normalizedBaseUrl = String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  const normalizedModel = normalizeValue(model);
  const normalizedModels = Array.isArray(models)
    ? models.map((item) => normalizeValue(item)).filter(Boolean)
    : [];

  const uniqueModels = [...new Set([normalizedModel, ...normalizedModels].filter(Boolean))];

  const modelsRecord: Record<
    string,
    { name: string; limit?: { context: number; output?: number } }
  > = {};
  for (const m of uniqueModels) {
    if (m) {
      const contextLength = modelContextLengths?.[m];
      const maxOutput = modelMaxOutputTokens?.[m];
      const limit = contextLength
        ? { context: contextLength, ...(maxOutput ? { output: maxOutput } : {}) }
        : undefined;
      modelsRecord[m] = {
        name: m,
        ...(limit ? { limit } : {}),
      };
    }
  }

  return {
    npm: "@ai-sdk/anthropic",
    name: "Routiform",
    options: {
      baseURL: normalizedBaseUrl,
      apiKey: apiKey || "sk_routiform",
    },
    models: modelsRecord,
  };
};

export const mergeOpenCodeConfig = (
  existingConfig: Record<string, unknown> | null | undefined,
  input: OpenCodeConfigInput
) => {
  const safeConfig =
    existingConfig && typeof existingConfig === "object" && !Array.isArray(existingConfig)
      ? existingConfig
      : {};

  const providerEntry = buildOpenCodeProviderConfig(input);

  const next: Record<string, unknown> = {
    ...(safeConfig as Record<string, unknown>),
    provider: {
      ...(((safeConfig as Record<string, unknown>).provider as Record<string, unknown>) || {}),
      [OPENCODE_PROVIDER_KEY]: providerEntry,
    },
  };

  // Do not set a default top-level `model` — let the user pick interactively in opencode.

  if (next.$schema == null) {
    next.$schema = "https://opencode.ai/config.json";
  }

  return next;
};
