/**
 * Oh My Pi (`omp`) configuration.
 *
 * omp splits its config across two files under `~/.omp/agent/`:
 *
 * - `models.yml` holds `providers.<id>` blocks. A custom OpenAI-compatible provider needs
 *   `baseUrl`, `api`, an `apiKey`, and either an explicit `models` list or a `discovery`
 *   block. Its root object accepts only `providers` — any other top-level key fails schema
 *   validation and makes the registry skip the whole file, so nothing else may be written.
 * - `config.yml` holds settings, of which only `modelRoles.default` is written here: a
 *   provider block alone leaves the models selectable but unselected.
 *
 * `apiKey` resolves as environment-variable-name-or-literal — a value naming an existing
 * variable reads that variable, otherwise the string itself is the key. Routiform keys are
 * `sk-<machineId>-<keyId>-<crc>` shaped, so they never collide with a variable name and
 * land as literals. A leading `!` is omp's run-this-as-a-shell-command form, which is why
 * `buildOmpProvider` refuses a key starting with one.
 *
 * Schema: https://github.com/can1357/oh-my-pi/blob/HEAD/docs/models.md
 */

type JsonRecord = Record<string, unknown>;

/** The provider id the managed block is written under. */
export const OMP_PROVIDER_ID = "routiform";

/** The wire omp speaks to a Routiform endpoint. */
const OMP_PROVIDER_API = "openai-completions";

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};

const stripTrailingSlash = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/\/+$/, "");

export type OmpConfigInput = {
  baseUrl: string;
  apiKey?: string;
  model: string;
  models?: string[];
  /** Map of model id → context window size in tokens. */
  contextLengths?: Record<string, number>;
  /** Map of model id → max output tokens. */
  maxOutputTokens?: Record<string, number>;
};

/** `provider/model` — the selector form omp uses for a model role. */
export const toOmpModelSelector = (model: string) => `${OMP_PROVIDER_ID}/${model}`;

export function buildOmpProvider({
  baseUrl,
  apiKey,
  model,
  models,
  contextLengths,
  maxOutputTokens,
}: OmpConfigInput): JsonRecord {
  const ids = Array.from(new Set([model, ...(models ?? [])].filter(Boolean)));
  const key = apiKey || "sk_routiform";

  // omp runs a `!`-prefixed apiKey as a shell command and uses its stdout, so writing one
  // through would turn a config save into stored command execution on the next omp run.
  if (key.startsWith("!")) {
    throw new Error("Oh My Pi treats an apiKey starting with '!' as a shell command");
  }

  return {
    baseUrl: stripTrailingSlash(baseUrl),
    api: OMP_PROVIDER_API,
    apiKey: key,
    // Routiform fronts several upstreams, so the model list is whatever the user selected
    // rather than a discovery probe — an upstream that is down must not empty the list.
    authHeader: true,
    models: ids.map((id) => ({
      id,
      name: id,
      // omp validates these as positive when present, so an unknown limit is omitted
      // rather than written as 0.
      ...(contextLengths?.[id] ? { contextWindow: contextLengths[id] } : {}),
      ...(maxOutputTokens?.[id] ? { maxTokens: maxOutputTokens[id] } : {}),
    })),
  };
}

export function hasRoutiformOmpConfig(existingConfig: unknown) {
  return OMP_PROVIDER_ID in asRecord(asRecord(existingConfig).providers);
}

/** Adds or replaces the managed provider block, leaving every other provider untouched. */
export function applyRoutiformOmpModels(
  existingConfig: unknown,
  input: OmpConfigInput
): JsonRecord {
  const config = { ...asRecord(existingConfig) };
  config.providers = {
    ...asRecord(config.providers),
    [OMP_PROVIDER_ID]: buildOmpProvider(input),
  };
  return config;
}

export function removeRoutiformOmpModels(existingConfig: unknown): JsonRecord {
  const config = { ...asRecord(existingConfig) };
  const providers = { ...asRecord(config.providers) };
  delete providers[OMP_PROVIDER_ID];

  // `providers` is the only root key omp accepts, so an emptied map is dropped rather than
  // left behind as `providers: {}`.
  if (Object.keys(providers).length > 0) config.providers = providers;
  else delete config.providers;

  return config;
}

/** Points the `default` model role at the selected model, preserving the other roles. */
export function applyRoutiformOmpSettings(existingConfig: unknown, model: string): JsonRecord {
  const config = { ...asRecord(existingConfig) };
  config.modelRoles = { ...asRecord(config.modelRoles), default: toOmpModelSelector(model) };
  return config;
}

export function removeRoutiformOmpSettings(existingConfig: unknown): JsonRecord {
  const config = { ...asRecord(existingConfig) };
  const modelRoles = { ...asRecord(config.modelRoles) };

  // Only clear a role still pointing at the provider being removed — a role the user has
  // since repointed at another provider is theirs to keep.
  for (const [role, selector] of Object.entries(modelRoles)) {
    if (String(selector ?? "").startsWith(`${OMP_PROVIDER_ID}/`)) delete modelRoles[role];
  }

  if (Object.keys(modelRoles).length > 0) config.modelRoles = modelRoles;
  else delete config.modelRoles;

  return config;
}
