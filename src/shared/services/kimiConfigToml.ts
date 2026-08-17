import {
  finalizeTomlLines,
  parseTomlRootValue,
  removeTomlRootKey,
  removeTomlSection,
  removeTomlSectionsWhere,
  splitTomlLines,
  toTomlKey,
  toTomlString,
  upsertTomlSection,
  upsertTomlRootKey,
} from "./tomlLines";

export const KIMI_PROVIDER_ID = "routiform";

const PROVIDER_SECTION_NAME = `providers.${KIMI_PROVIDER_ID}`;

/** Kimi Code speaks the OpenAI Chat Completions protocol to any compatible gateway. */
const KIMI_PROVIDER_TYPE = "openai";

/**
 * `max_context_size` is required on every model entry and must be at least 1, so a model
 * whose window Routiform could not resolve still needs a number. Kimi's own default for a
 * model defined through the KIMI_MODEL_* variables is 256K, and matching it keeps an
 * unresolved model behaving the way the CLI would have behaved on its own.
 */
export const KIMI_DEFAULT_CONTEXT_SIZE = 262144;

/** A model alias is namespaced so it is obvious in `/model` which entries Routiform owns. */
export const toKimiModelAlias = (model: string) => `${KIMI_PROVIDER_ID}/${model}`;

const modelSectionName = (model: string) => `models.${toTomlKey(toKimiModelAlias(model))}`;

/** Every managed alias carries a `/`, so toTomlKey always quotes it into this shape. */
const isManagedModelSection = (sectionName: string) =>
  sectionName.startsWith(`models."${KIMI_PROVIDER_ID}/`);

/**
 * `baseUrl` is optional on the shared save schema, and a missing one would otherwise be
 * written as the bare `"/v1"` — a config that looks saved and fails on the first request.
 */
const normalizeBaseUrl = (baseUrl: string) => {
  const trimmed = String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  if (!/^https?:\/\/.+/i.test(trimmed)) {
    throw new Error(`Base URL must be an http(s) URL: ${baseUrl || "(empty)"}`);
  }
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
};

/**
 * A `]` or a newline in a model id would end the `[models."…"]` header early and turn the
 * rest of the id into config, so the write is refused rather than allowed to corrupt a
 * file the user owns. Every id Routiform serves is a plain model slug; this guards the
 * request body, which is not.
 */
const assertWritableModelId = (model: string) => {
  if (/[\]\r\n]/.test(model)) {
    throw new Error(`Model id cannot contain ']' or a line break: ${model}`);
  }
};

/**
 * An earlier version appended `default_model` after the last header, where TOML reads it as
 * a key of that table — Kimi Code then rejected the whole file. Such a line sits outside the
 * root block, so the root-key helpers cannot see it, let alone replace it. Dropping every
 * line that assigns a `routiform/` alias, wherever it sits, repairs those files on the next
 * save; the namespace is what makes it safe, since no foreign table would carry our alias.
 */
const stripManagedDefaultModel = (lines: string[]) => {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (new RegExp(`^\\s*default_model\\s*=\\s*"${KIMI_PROVIDER_ID}/`).test(lines[index])) {
      lines.splice(index, 1);
    }
  }
};

export const hasRoutiformKimiConfig = (config: string | null) => {
  if (!config) return false;
  return config.includes(`[${PROVIDER_SECTION_NAME}]`);
};

export interface KimiConfigInput {
  baseUrl: string;
  apiKey?: string;
  model: string;
  models?: string[];
  contextLengths?: Record<string, number>;
}

/**
 * Write the Routiform provider, one model entry per selected model, and the default model
 * into an existing `config.toml`.
 *
 * Everything outside those sections is left byte for byte — the OAuth-provisioned
 * `[providers."managed:kimi-code"]` block, permission rules, hooks, and the user's own
 * providers all survive. Model sections are rebuilt from the current selection rather than
 * merged, so deselecting a model actually removes it instead of leaving a dead alias in
 * `/model`.
 */
export const applyRoutiformKimiConfig = (
  existingConfig: string | null,
  { baseUrl, apiKey, model, models, contextLengths }: KimiConfigInput
) => {
  const ids = Array.from(new Set([model, ...(models ?? [])].filter(Boolean)));
  ids.forEach(assertWritableModelId);

  const lines = splitTomlLines(existingConfig);

  removeTomlSectionsWhere(lines, isManagedModelSection);
  stripManagedDefaultModel(lines);

  upsertTomlRootKey(lines, "default_model", toKimiModelAlias(model));
  upsertTomlSection(lines, PROVIDER_SECTION_NAME, [
    `[${PROVIDER_SECTION_NAME}]`,
    `type = ${toTomlString(KIMI_PROVIDER_TYPE)}`,
    `base_url = ${toTomlString(normalizeBaseUrl(baseUrl))}`,
    `api_key = ${toTomlString(apiKey || "sk_routiform")}`,
  ]);

  for (const id of ids) {
    upsertTomlSection(lines, modelSectionName(id), [
      `[${modelSectionName(id)}]`,
      `provider = ${toTomlString(KIMI_PROVIDER_ID)}`,
      `model = ${toTomlString(id)}`,
      `max_context_size = ${contextLengths?.[id] || KIMI_DEFAULT_CONTEXT_SIZE}`,
      `display_name = ${toTomlString(id)}`,
    ]);
  }

  return finalizeTomlLines(lines);
};

/**
 * Undo what apply wrote. `default_model` is cleared only while it still points at a
 * Routiform alias — a user who has since switched back to their own model keeps that
 * choice, and Kimi fails to start when `default_model` names an alias that no longer
 * exists.
 */
export const removeRoutiformKimiConfig = (existingConfig: string | null) => {
  const lines = splitTomlLines(existingConfig);

  if (String(parseTomlRootValue(lines, "default_model") || "").startsWith(`${KIMI_PROVIDER_ID}/`)) {
    removeTomlRootKey(lines, "default_model");
  }
  stripManagedDefaultModel(lines);

  removeTomlSection(lines, PROVIDER_SECTION_NAME);
  removeTomlSectionsWhere(lines, isManagedModelSection);

  return finalizeTomlLines(lines);
};
