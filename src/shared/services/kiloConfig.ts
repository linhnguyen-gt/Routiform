/**
 * Kilo Code CLI configuration.
 *
 * Kilo 1.0 is an OpenCode fork and splits its state across two files that are NOT
 * interchangeable:
 *
 *  - `<XDG_DATA_HOME>/kilo/auth.json` stores credentials only. Every entry is decoded
 *    against a closed union (`oauth` | `api` | `wellknown`) and entries that fail to
 *    decode are dropped without any warning, so `type` has to be exactly `"api"` and the
 *    secret has to live under `key`. An endpoint or a model id in this file is ignored.
 *  - `<XDG_CONFIG_HOME>/kilo/kilo.json` stores the provider endpoint and the default
 *    model: `provider.<id>.options.baseURL` and a root `model` of `"<providerID>/<modelID>"`.
 *
 * Kilo then merges the two — an `api` auth entry becomes the provider's `apiKey` when the
 * config does not set one — which is why the key is written once, to auth.json, and never
 * duplicated into kilo.json.
 */

export const KILO_PROVIDER_ID = "routiform";

/** Provider ids earlier versions wrote, in shapes Kilo silently discards. */
export const KILO_LEGACY_AUTH_IDS = ["openai-compatible", "routiform"] as const;

/** Bundled with the CLI, and the fallback Kilo assumes for a provider that names no package. */
const KILO_PROVIDER_NPM = "@ai-sdk/openai-compatible";

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};

const normalizeBaseUrl = (baseUrl: string) => (baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`);

export type KiloModelLimit = { context: number; output: number };

export type KiloConfigInput = {
  baseUrl: string;
  model: string;
  models?: string[];
  /** Per-model token limits, when the catalog knows them. */
  limits?: Record<string, KiloModelLimit>;
};

/** The default model reference Kilo resolves, `<providerID>/<modelID>`. */
export const toKiloModelRef = (model: string) => `${KILO_PROVIDER_ID}/${model}`;

export function buildKiloProvider({ baseUrl, model, models, limits }: KiloConfigInput): JsonRecord {
  const modelIds = Array.from(new Set([model, ...(models ?? [])].filter(Boolean)));

  return {
    npm: KILO_PROVIDER_NPM,
    name: "Routiform",
    options: { baseURL: normalizeBaseUrl(baseUrl) },
    models: Object.fromEntries(
      modelIds.map((id) => {
        const limit = limits?.[id];
        return [id, { name: id, ...(limit ? { limit } : {}) }];
      })
    ),
  };
}

export function applyRoutiformKiloConfig(existingConfig: unknown, input: KiloConfigInput) {
  const config = { ...asRecord(existingConfig) };
  const provider = { ...asRecord(config.provider) };

  provider[KILO_PROVIDER_ID] = buildKiloProvider(input);
  config.provider = provider;
  config.model = toKiloModelRef(input.model);

  return config;
}

export function removeRoutiformKiloConfig(existingConfig: unknown) {
  const config = { ...asRecord(existingConfig) };
  const provider = { ...asRecord(config.provider) };

  delete provider[KILO_PROVIDER_ID];
  if (Object.keys(provider).length === 0) {
    delete config.provider;
  } else {
    config.provider = provider;
  }

  // Only clear the default model when it still points at the provider being removed —
  // a model the user picked from some other provider is not ours to reset.
  if (typeof config.model === "string" && config.model.startsWith(`${KILO_PROVIDER_ID}/`)) {
    delete config.model;
  }

  return config;
}

export function applyRoutiformKiloAuth(existingAuth: unknown, apiKey: string) {
  const auth = { ...asRecord(existingAuth) };
  for (const id of KILO_LEGACY_AUTH_IDS) delete auth[id];
  auth[KILO_PROVIDER_ID] = { type: "api", key: apiKey };
  return auth;
}

export function removeRoutiformKiloAuth(existingAuth: unknown) {
  const auth = { ...asRecord(existingAuth) };
  for (const id of KILO_LEGACY_AUTH_IDS) delete auth[id];
  return auth;
}

export function hasRoutiformKiloConfig(config: unknown) {
  const provider = asRecord(asRecord(config).provider);
  const entry = asRecord(provider[KILO_PROVIDER_ID]);
  const baseUrl = asRecord(entry.options).baseURL;
  return typeof baseUrl === "string" && baseUrl.trim().length > 0;
}
