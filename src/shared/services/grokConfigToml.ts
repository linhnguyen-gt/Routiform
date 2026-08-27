import {
  finalizeTomlLines,
  parseTomlSectionValue,
  removeTomlSectionKey,
  removeTomlSectionsWhere,
  splitTomlLines,
  toTomlKey,
  toTomlString,
  upsertTomlSection,
  upsertTomlSectionKey,
} from "./tomlLines";

export const GROK_PROVIDER_ID = "routiform";

/** The table that holds Grok's model *settings*, as opposed to the `[model.x]` entries. */
const MODELS_SECTION_NAME = "models";

/**
 * `context_window` drives Grok's auto-compact, so an entry without one compacts on the
 * wrong boundary. Written large on purpose: over-advertising costs nothing (Grok trusts
 * the proxy to reject overlong requests), while under-advertising compacts context the
 * proxy actually had room for. Follows CONTEXT_CONFIG.defaultLimit.
 */
export const GROK_DEFAULT_CONTEXT_WINDOW = 300_000;

/** A model alias is namespaced so it is obvious in `/model` which entries Routiform owns. */
export const toGrokModelAlias = (model: string) => `${GROK_PROVIDER_ID}/${model}`;

const modelSectionName = (model: string) => `model.${toTomlKey(toGrokModelAlias(model))}`;

/** Every managed alias carries a `/`, so toTomlKey always quotes it into this shape. */
const isManagedModelSection = (sectionName: string) =>
  sectionName.startsWith(`model."${GROK_PROVIDER_ID}/`);

/**
 * `baseUrl` is optional on the shared save schema, and a missing one would otherwise be
 * written as the bare `"/v1"` — a config that looks saved and fails on the first request.
 */
const normalizeBaseUrl = (baseUrl: string) => {
  const trimmed = String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  // Anchored at both ends: an unanchored test accepts a URL with a newline and
  // whatever the caller appended after it.
  if (!/^https?:\/\/\S+$/i.test(trimmed)) {
    throw new Error(`Base URL must be an http(s) URL: ${baseUrl || "(empty)"}`);
  }
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
};

/**
 * A `]` or a newline in a model id would end the `[model."…"]` header early and turn the
 * rest of the id into config, so the write is refused rather than allowed to corrupt a
 * file the user owns. Every id Routiform serves is a plain model slug; this guards the
 * request body, which is not.
 */
const assertWritableModelId = (model: string) => {
  if (/[\]\r\n]/.test(model)) {
    throw new Error(`Model id cannot contain ']' or a line break: ${model}`);
  }
};

export const hasRoutiformGrokConfig = (config: string | null) => {
  if (!config) return false;
  return config.includes(`[model."${GROK_PROVIDER_ID}/`);
};

export interface GrokConfigInput {
  baseUrl: string;
  apiKey?: string;
  model: string;
  models?: string[];
  contextLengths?: Record<string, number>;
}

/**
 * Write one model entry per selected model, and the default model, into an existing
 * `~/.grok/config.toml`.
 *
 * Everything outside those sections is left byte for byte — `[cli]`, the marketplace
 * sources array, MCP servers, feature flags, and the user's own `[model.x]` entries all
 * survive. Managed sections are rebuilt from the current selection rather than merged, so
 * deselecting a model removes it instead of leaving a dead alias in `/model`.
 *
 * `[models]` is edited key by key rather than replaced, because `web_search` lives in that
 * same table and belongs to the user.
 */
export const applyRoutiformGrokConfig = (
  existingConfig: string | null,
  { baseUrl, apiKey, model, models, contextLengths }: GrokConfigInput
) => {
  const ids = Array.from(new Set([model, ...(models ?? [])].filter(Boolean)));
  ids.forEach(assertWritableModelId);

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const lines = splitTomlLines(existingConfig);

  removeTomlSectionsWhere(lines, isManagedModelSection);

  for (const id of ids) {
    upsertTomlSection(lines, modelSectionName(id), [
      `[${modelSectionName(id)}]`,
      `model = ${toTomlString(id)}`,
      `base_url = ${toTomlString(normalizedBaseUrl)}`,
      `name = ${toTomlString(`Routiform ${id}`)}`,
      // Grok resolves credentials api_key first, so an inline key wins over a stale
      // XAI_API_KEY in the environment and no shell export is needed.
      `api_key = ${toTomlString(apiKey || "sk_routiform")}`,
      `context_window = ${contextLengths?.[id] || GROK_DEFAULT_CONTEXT_WINDOW}`,
    ]);
  }

  upsertTomlSectionKey(lines, MODELS_SECTION_NAME, "default", toGrokModelAlias(model));

  return finalizeTomlLines(lines);
};

/**
 * Undo what apply wrote. The default is cleared only while it still points at a Routiform
 * alias — a user who has since switched back to grok-4.6 keeps that choice, and Grok falls
 * back to its own default once the key is gone.
 */
export const removeRoutiformGrokConfig = (existingConfig: string | null) => {
  const lines = splitTomlLines(existingConfig);

  const currentDefault = parseTomlSectionValue(lines, MODELS_SECTION_NAME, "default");
  if (String(currentDefault || "").startsWith(`${GROK_PROVIDER_ID}/`)) {
    removeTomlSectionKey(lines, MODELS_SECTION_NAME, "default");
  }

  removeTomlSectionsWhere(lines, isManagedModelSection);

  return finalizeTomlLines(lines);
};
