/**
 * Qwen Code (`qwen`) configuration.
 *
 * Qwen keys `modelProviders` by auth type, and each value is an ARRAY of model entries —
 * not one provider object with a model map, the way opencode and Kilo do it. `openai` is a
 * built-in auth type, so the entries need no `providerProtocol` mapping.
 *
 * Credentials are never stored in settings.json: an entry names an environment variable in
 * `envKey` and the runtime reads `process.env[envKey]` at startup, with `~/.qwen/.env`
 * loaded automatically. A dedicated variable is used rather than the default
 * `OPENAI_API_KEY` so applying this config cannot overwrite a real OpenAI key the user
 * already relies on.
 *
 * Schema: https://github.com/QwenLM/qwen-code/blob/main/docs/users/configuration/model-providers.md
 */

type JsonRecord = Record<string, unknown>;

/** The built-in auth type whose protocol matches an OpenAI-compatible endpoint. */
export const QWEN_AUTH_TYPE = "openai";

/** The environment variable the managed entries read their key from. */
export const QWEN_API_KEY_ENV = "ROUTIFORM_API_KEY";

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};

const stripTrailingSlash = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/\/+$/, "");

export type QwenConfigInput = {
  baseUrl: string;
  model: string;
  models?: string[];
  /** Map of model id → context window size in tokens. */
  contextLengths?: Record<string, number>;
};

export function buildQwenModelEntries({
  baseUrl,
  model,
  models,
  contextLengths,
}: QwenConfigInput): JsonRecord[] {
  const normalizedBaseUrl = stripTrailingSlash(baseUrl);
  const ids = Array.from(new Set([model, ...(models ?? [])].filter(Boolean)));

  return ids.map((id) => {
    const contextWindowSize = contextLengths?.[id];
    return {
      id,
      name: id,
      envKey: QWEN_API_KEY_ENV,
      baseUrl: normalizedBaseUrl,
      // `generationConfig` applies atomically — Qwen does not merge a lower-level default
      // into it — so the window is only written when it is actually known.
      ...(contextWindowSize && contextWindowSize > 0
        ? { generationConfig: { contextWindowSize } }
        : {}),
    };
  });
}

/**
 * True for an entry this app wrote. The env key identifies the current ones; the endpoint
 * is accepted too, so entries written before that key existed are still recognised.
 */
const isManagedEntry = (entry: unknown, normalizedBaseUrl: string, localHosts: string[]) => {
  const record = asRecord(entry);
  if (record.envKey === QWEN_API_KEY_ENV) return true;

  const entryBaseUrl = stripTrailingSlash(record.baseUrl).toLowerCase();
  if (!entryBaseUrl) return false;
  if (normalizedBaseUrl && entryBaseUrl === normalizedBaseUrl.toLowerCase()) return true;
  if (entryBaseUrl.includes("routiform")) return true;
  return localHosts.some((host) => entryBaseUrl.includes(host));
};

const readProviderEntries = (config: JsonRecord): unknown[] => {
  const providers = asRecord(config.modelProviders);
  const entries = providers[QWEN_AUTH_TYPE];
  return Array.isArray(entries) ? entries : [];
};

export function hasRoutiformQwenConfig(
  existingConfig: unknown,
  { baseUrl = "", localHosts = [] as string[] } = {}
) {
  const normalizedBaseUrl = stripTrailingSlash(baseUrl);
  return readProviderEntries(asRecord(existingConfig)).some((entry) =>
    isManagedEntry(entry, normalizedBaseUrl, localHosts)
  );
}

export function applyRoutiformQwenConfig(
  existingConfig: unknown,
  input: QwenConfigInput,
  { localHosts = [] as string[] } = {}
): JsonRecord {
  const config = { ...asRecord(existingConfig) };
  const normalizedBaseUrl = stripTrailingSlash(input.baseUrl);

  const kept = readProviderEntries(config).filter(
    (entry) => !isManagedEntry(entry, normalizedBaseUrl, localHosts)
  );

  config.modelProviders = {
    ...asRecord(config.modelProviders),
    [QWEN_AUTH_TYPE]: [...kept, ...buildQwenModelEntries({ ...input, baseUrl: normalizedBaseUrl })],
  };

  // `model.name` is the model Qwen resolves at startup, and `security.auth.selectedType`
  // is what sends it down the OpenAI-compatible path instead of Qwen OAuth. Writing the
  // provider without both leaves the entry present but unused.
  config.model = { ...asRecord(config.model), name: input.model };
  const security = { ...asRecord(config.security) };
  security.auth = { ...asRecord(security.auth), selectedType: QWEN_AUTH_TYPE };
  config.security = security;

  return config;
}

export function removeRoutiformQwenConfig(
  existingConfig: unknown,
  { baseUrl = "", localHosts = [] as string[] } = {}
): JsonRecord {
  const config = { ...asRecord(existingConfig) };
  const normalizedBaseUrl = stripTrailingSlash(baseUrl);

  const managedIds = new Set(
    readProviderEntries(config)
      .filter((entry) => isManagedEntry(entry, normalizedBaseUrl, localHosts))
      .map((entry) => String(asRecord(entry).id || ""))
      .filter(Boolean)
  );
  const kept = readProviderEntries(config).filter(
    (entry) => !isManagedEntry(entry, normalizedBaseUrl, localHosts)
  );

  const providers = { ...asRecord(config.modelProviders) };
  if (kept.length > 0) {
    providers[QWEN_AUTH_TYPE] = kept;
  } else {
    delete providers[QWEN_AUTH_TYPE];
  }
  if (Object.keys(providers).length > 0) {
    config.modelProviders = providers;
  } else {
    delete config.modelProviders;
  }

  // Only clear the default model while it still names one of the entries being removed —
  // a model the user has since picked elsewhere is theirs to keep.
  const model = asRecord(config.model);
  if (managedIds.has(String(model.name || ""))) {
    delete model.name;
    if (Object.keys(model).length > 0) config.model = model;
    else delete config.model;
  }

  // The auth type is only ours to unset once no OpenAI-compatible provider is left at all;
  // otherwise the user's own entry would lose the setting that selects it.
  const security = asRecord(config.security);
  const auth = asRecord(security.auth);
  if (!providers[QWEN_AUTH_TYPE] && auth.selectedType === QWEN_AUTH_TYPE) {
    delete auth.selectedType;
    if (Object.keys(auth).length > 0) security.auth = auth;
    else delete security.auth;
    if (Object.keys(security).length > 0) config.security = security;
    else delete config.security;
  }

  return config;
}
