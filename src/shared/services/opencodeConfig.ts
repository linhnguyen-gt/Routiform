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

const OPENCODE_PROVIDER_KEYS = {
  openai: "routiform-openai",
  anthropic: "routiform-anthropic",
} as const;
const LEGACY_OPENCODE_PROVIDER_KEY = "routiform";
const DEFAULT_OUTPUT_TOKENS = 16384;
const DEFAULT_FALLBACK_MODEL = "gpt-4o";

type OpenCodeProviderKind = keyof typeof OPENCODE_PROVIDER_KEYS;

function isAnthropicModel(modelId: string) {
  const normalized = normalizeValue(modelId).toLowerCase();
  return normalized.startsWith("cc/") || normalized.includes("claude");
}

function getProviderKindForModel(modelId: string): OpenCodeProviderKind {
  return isAnthropicModel(modelId) ? "anthropic" : "openai";
}

function getProviderKey(kind: OpenCodeProviderKind) {
  return OPENCODE_PROVIDER_KEYS[kind];
}

function getProviderPackage(kind: OpenCodeProviderKind) {
  return kind === "anthropic" ? "@ai-sdk/anthropic" : "@ai-sdk/openai";
}

/**
 * OpenCode expects `model` at the root of opencode.json, e.g.
 * `routiform-openai/provider/model-id` or `routiform-anthropic/provider/model-id`.
 */
export function toOpenCodeModelRef(model: string | undefined | null): string | undefined {
  const v = normalizeValue(model);
  if (!v) return undefined;
  if (v.startsWith(`${OPENCODE_PROVIDER_KEYS.openai}/`)) return v;
  if (v.startsWith(`${OPENCODE_PROVIDER_KEYS.anthropic}/`)) return v;
  return `${getProviderKey(getProviderKindForModel(v))}/${v}`;
}

type OpenCodeModelConfig = {
  name: string;
  limit?: { context: number; output: number };
  variants?: Record<string, Record<string, unknown>>;
};

type OpenCodeProviderConfig = {
  npm: string;
  name: string;
  options: {
    baseURL: string;
    apiKey: string;
  };
  models: Record<string, OpenCodeModelConfig>;
};

const OPENAI_REASONING_MODEL_RE = /(^|[/-])(gpt|o[1-9]|codex)([/-]|$)/;

function isOpenAiReasoningModel(modelId: string) {
  const normalized = normalizeValue(modelId).toLowerCase();
  return normalized.startsWith("cx/") || OPENAI_REASONING_MODEL_RE.test(normalized);
}

function buildVariantsForModel(
  modelId: string
): Record<string, Record<string, unknown>> | undefined {
  if (isAnthropicModel(modelId)) {
    return {
      high: {
        thinking: {
          type: "enabled",
          budgetTokens: 16000,
        },
      },
      max: {
        thinking: {
          type: "enabled",
          budgetTokens: 31999,
        },
      },
    };
  }

  if (isOpenAiReasoningModel(modelId)) {
    return {
      low: { reasoningEffort: "low" },
      medium: { reasoningEffort: "medium" },
      high: { reasoningEffort: "high" },
      xhigh: { reasoningEffort: "xhigh" },
    };
  }
}

function buildModelConfig(
  modelId: string,
  modelContextLengths?: Record<string, number>,
  modelMaxOutputTokens?: Record<string, number>
): OpenCodeModelConfig {
  const contextLength = modelContextLengths?.[modelId];
  const maxOutput = modelMaxOutputTokens?.[modelId] || DEFAULT_OUTPUT_TOKENS;
  const variants = buildVariantsForModel(modelId);
  return {
    name: modelId,
    ...(contextLength ? { limit: { context: contextLength, output: maxOutput } } : {}),
    ...(variants ? { variants } : {}),
  };
}

export const buildOpenCodeProviderConfigs = ({
  baseUrl,
  apiKey,
  model,
  models,
  modelContextLengths,
  modelMaxOutputTokens,
}: OpenCodeConfigInput): Record<string, OpenCodeProviderConfig> => {
  const normalizedBaseUrl = String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  const normalizedModel = normalizeValue(model);
  const normalizedModels = Array.isArray(models)
    ? models.map((item) => normalizeValue(item)).filter(Boolean)
    : [];

  const uniqueModels = [...new Set([normalizedModel, ...normalizedModels].filter(Boolean))].filter(
    Boolean
  );

  const groupedModels: Record<OpenCodeProviderKind, Record<string, OpenCodeModelConfig>> = {
    openai: {},
    anthropic: {},
  };

  if (uniqueModels.length === 0) {
    groupedModels.openai[DEFAULT_FALLBACK_MODEL] = buildModelConfig(
      DEFAULT_FALLBACK_MODEL,
      modelContextLengths,
      modelMaxOutputTokens
    );
  }

  for (const modelId of uniqueModels) {
    groupedModels[getProviderKindForModel(modelId)][modelId] = buildModelConfig(
      modelId,
      modelContextLengths,
      modelMaxOutputTokens
    );
  }

  const providers: Record<string, OpenCodeProviderConfig> = {};
  for (const kind of Object.keys(groupedModels) as OpenCodeProviderKind[]) {
    if (Object.keys(groupedModels[kind]).length === 0) continue;
    providers[getProviderKey(kind)] = {
      npm: getProviderPackage(kind),
      name: kind === "anthropic" ? "Routiform Anthropic" : "Routiform OpenAI",
      options: {
        baseURL: normalizedBaseUrl,
        apiKey: apiKey || "sk_routiform",
      },
      models: groupedModels[kind],
    };
  }

  return providers;
};

export const mergeOpenCodeConfig = (
  existingConfig: Record<string, unknown> | null | undefined,
  input: OpenCodeConfigInput
) => {
  const safeConfig =
    existingConfig && typeof existingConfig === "object" && !Array.isArray(existingConfig)
      ? existingConfig
      : {};

  const providerEntries = buildOpenCodeProviderConfigs(input);
  const existingProviders = {
    ...(((safeConfig as Record<string, unknown>).provider as Record<string, unknown>) || {}),
  };
  delete existingProviders[LEGACY_OPENCODE_PROVIDER_KEY];
  delete existingProviders[OPENCODE_PROVIDER_KEYS.openai];
  delete existingProviders[OPENCODE_PROVIDER_KEYS.anthropic];

  const next: Record<string, unknown> = {
    ...(safeConfig as Record<string, unknown>),
    provider: {
      ...existingProviders,
      ...providerEntries,
    },
  };

  // Point opencode at the model that was just configured. Leaving this unset kept opencode on
  // whatever default it resolves on its own — `anthropic/claude-sonnet-5` — so the provider and
  // its `limit` were written but never used, and the context meter reported the wrong model's
  // window. Every other tool's apply sets its default model; this one used not to.
  const modelRef = toOpenCodeModelRef(input.model || input.models?.[0]);
  if (modelRef) {
    next.model = modelRef;
  }

  if (next.$schema == null) {
    next.$schema = "https://opencode.ai/config.json";
  }

  return next;
};
