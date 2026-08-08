/**
 * Continue assistant configuration.
 *
 * Continue replaced `config.json` with `config.yaml`; the JSON form — and its `title` key
 * for naming a model — is deprecated. A YAML assistant file requires `name`, `version` and
 * `schema` at the top level, and each `models` entry is keyed by `name`, not `title`.
 */

type JsonRecord = Record<string, unknown>;

/** Marks the entry this app owns so a re-save updates it instead of appending a duplicate. */
export const CONTINUE_MANAGED_FLAG = "routiformManaged";

const DEFAULT_ROLES = ["chat", "edit", "apply"] as const;

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};

const stripTrailingSlash = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/\/+$/, "");

export type ContinueModelInput = {
  baseUrl: string;
  apiKey?: string;
  model: string;
};

export function buildContinueModel({ baseUrl, apiKey, model }: ContinueModelInput): JsonRecord {
  return {
    name: model,
    provider: "openai",
    model,
    apiBase: stripTrailingSlash(baseUrl),
    apiKey: apiKey || "sk_routiform",
    roles: [...DEFAULT_ROLES],
    [CONTINUE_MANAGED_FLAG]: true,
  };
}

/**
 * True for an entry this app wrote. Matching on the managed flag alone would orphan the
 * entries written before the flag existed, so the endpoint is accepted as evidence too.
 */
function isManagedEntry(entry: unknown, normalizedBaseUrl: string, localHosts: string[]) {
  const record = asRecord(entry);
  if (record[CONTINUE_MANAGED_FLAG] === true) return true;

  const apiBase = stripTrailingSlash(record.apiBase).toLowerCase();
  if (!apiBase) return false;
  if (apiBase === normalizedBaseUrl.toLowerCase()) return true;
  if (apiBase.includes("routiform")) return true;
  return localHosts.some((host) => apiBase.includes(host));
}

export function applyRoutiformContinueConfig(
  existingConfig: unknown,
  input: ContinueModelInput,
  { localHosts = [] as string[] } = {}
): JsonRecord {
  const config = { ...asRecord(existingConfig) };
  const entry = buildContinueModel(input);
  const normalizedBaseUrl = stripTrailingSlash(input.baseUrl);

  // Required by the v1 assistant schema; never overwrite what the user already chose.
  if (typeof config.name !== "string" || !config.name.trim()) config.name = "routiform";
  if (config.version === undefined || config.version === null) config.version = "0.0.1";
  if (typeof config.schema !== "string" || !config.schema.trim()) config.schema = "v1";

  const models = Array.isArray(config.models) ? [...config.models] : [];
  const index = models.findIndex((item) => isManagedEntry(item, normalizedBaseUrl, localHosts));

  if (index >= 0) {
    models[index] = entry;
  } else {
    models.push(entry);
  }

  config.models = models;
  return config;
}
