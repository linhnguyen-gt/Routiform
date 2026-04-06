type OpenCodeConfigInput = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
};

const OPENCODE_DEFAULT_MODELS = [
  "claude-opus-4-5-thinking",
  "claude-sonnet-4-5-thinking",
  "gemini-3.1-pro-high",
  "gemini-3-flash",
] as const;

const normalizeValue = (value: unknown) =>
  String(value || "")
    .trim()
    .replace(/^\/+/, "");

const OPENCODE_PROVIDER_KEY = "omniroute";

/**
 * OpenCode expects `model` at the root of opencode.json, e.g. `omniroute/alias/model-id`
 * (same prefix as the `provider` entry key). See OpenCode + @ai-sdk/openai-compatible docs.
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
}: OpenCodeConfigInput): Record<string, any> => {
  const normalizedBaseUrl = String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  const normalizedModel = normalizeValue(model);

  const uniqueModels = [...new Set([normalizedModel, ...OPENCODE_DEFAULT_MODELS].filter(Boolean))];

  const modelsRecord: Record<string, { name: string }> = {};
  for (const m of uniqueModels) {
    if (m) {
      modelsRecord[m] = { name: m };
    }
  }

  return {
    npm: "@ai-sdk/openai-compatible",
    name: "OmniRoute",
    options: {
      baseURL: normalizedBaseUrl,
      apiKey: apiKey || "sk_omniroute",
    },
    models: modelsRecord,
  };
};

export const mergeOpenCodeConfig = (
  existingConfig: Record<string, any> | null | undefined,
  input: OpenCodeConfigInput
) => {
  const safeConfig =
    existingConfig && typeof existingConfig === "object" && !Array.isArray(existingConfig)
      ? existingConfig
      : {};

  const modelRef = toOpenCodeModelRef(input.model);
  const providerEntry = buildOpenCodeProviderConfig(input);

  const next: Record<string, any> = {
    ...safeConfig,
    provider: {
      ...((safeConfig as any).provider || {}),
      [OPENCODE_PROVIDER_KEY]: providerEntry,
    },
  };

  if (modelRef) {
    next.model = modelRef;
  }

  if (next.$schema == null) {
    next.$schema = "https://opencode.ai/config.json";
  }

  return next;
};
