import { load as loadYaml, dump as dumpYaml } from "js-yaml";

/**
 * Surgical edits to ~/.hermes/config.yaml.
 *
 * Hermes owns this file and a user may have hand-written unrelated blocks in it, so each
 * top-level block is replaced on its own rather than round-tripping the whole document.
 * Within `auxiliary:` the merge goes one level deeper still: the other side tasks (vision,
 * compression, web_extract, …) are the user's, and only `title_generation` is rewritten.
 */

type JsonRecord = Record<string, unknown>;

/** The env var Hermes reads for a custom OpenAI-compatible provider, via ~/.hermes/.env. */
export const HERMES_API_KEY_ENV = "OPENAI_API_KEY";

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};

const blockRegex = (key: string) =>
  new RegExp(`^${key}:[ \\t]*\\r?\\n((?:[ \\t]+.*\\r?\\n?|[ \\t]*\\r?\\n)*)`, "m");

export const MODEL_BLOCK_RE = blockRegex("model");
const AUXILIARY_BLOCK_RE = blockRegex("auxiliary");

/**
 * The `model:` block, including an explicit context window when the catalog knows one.
 *
 * Hermes normally auto-detects the window, but it classifies a local endpoint by probing
 * `/api/v1/models` first and reading a 200 there as "this is LM Studio". This app answers
 * that path, so Hermes takes its LM Studio branch, looks for `loaded_instances[].config`
 * that a proxy does not have, and falls back to a default window — and it caches the
 * misclassification to disk. `context_length` is the first step of Hermes' own resolution
 * chain, ahead of both the cache and the probe, which is why the explicit value is written
 * rather than left to detection.
 */
export const buildModelBlock = (model: string, baseUrl: string, contextLength?: number) =>
  `model:\n  default: "${model}"\n  provider: "custom"\n  base_url: "${baseUrl}"\n` +
  `  api_key: "\${${HERMES_API_KEY_ENV}}"\n` +
  (contextLength && contextLength > 0 ? `  context_length: ${Math.trunc(contextLength)}\n` : "");

export const parseModelBlock = (yaml: string) => {
  const match = yaml.match(MODEL_BLOCK_RE);
  if (!match) return null;
  const body = match[1] || "";
  const get = (key: string) => {
    const m = body.match(new RegExp(`^[ \\t]+${key}:[ \\t]*["']?([^"'\\r\\n]+)["']?`, "m"));
    return m ? m[1].trim() : null;
  };
  const contextLength = Number(get("context_length"));

  return {
    default: get("default"),
    provider: get("provider"),
    base_url: get("base_url"),
    context_length: Number.isFinite(contextLength) && contextLength > 0 ? contextLength : null,
  };
};

/**
 * Whether the model block points back at a local Routiform endpoint.
 *
 * Shared with the batch status endpoint so a collapsed card and an expanded one cannot
 * disagree about whether the tool is configured.
 */
export const hasRoutiformHermesConfig = (yaml: string) => {
  const model = parseModelBlock(yaml);
  if (!model?.base_url) return false;
  return model.provider === "custom" && /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(model.base_url);
};

const upsertBlock = (yaml: string, re: RegExp, newBlock: string) => {
  if (re.test(yaml)) return yaml.replace(re, newBlock);
  return yaml.length > 0 ? `${newBlock}\n${yaml}` : newBlock;
};

export const upsertModelBlock = (yaml: string, newBlock: string) =>
  upsertBlock(yaml, MODEL_BLOCK_RE, newBlock);

export const removeModelBlock = (yaml: string) =>
  yaml.replace(MODEL_BLOCK_RE, "").replace(/^\n+/, "");

const readAuxiliary = (yaml: string): JsonRecord => {
  const match = yaml.match(AUXILIARY_BLOCK_RE);
  if (!match) return {};
  try {
    return asRecord(loadYaml(`auxiliary:\n${match[1] || ""}`)).auxiliary as JsonRecord;
  } catch {
    return {};
  }
};

const writeAuxiliary = (yaml: string, auxiliary: JsonRecord) => {
  if (Object.keys(auxiliary).length === 0) {
    return yaml.replace(AUXILIARY_BLOCK_RE, "").replace(/^\n+/, "");
  }
  const block = dumpYaml({ auxiliary }, { indent: 2, lineWidth: -1 });
  return upsertBlock(yaml, AUXILIARY_BLOCK_RE, block);
};

export type HermesTitleGenerationInput = {
  model: string;
  baseUrl: string;
};

/**
 * Points session-title generation at a specific model instead of the main chat model.
 *
 * Passing no model clears the override, which returns the task to `provider: auto` —
 * Hermes' own default of reusing whatever the main agent is running.
 */
export const upsertTitleGenerationBlock = (
  yaml: string,
  input: HermesTitleGenerationInput | null
) => {
  const auxiliary = { ...readAuxiliary(yaml) };
  const current = asRecord(auxiliary.title_generation);

  if (!input?.model) {
    if (Object.keys(current).length === 0) return yaml;
    auxiliary.title_generation = { ...current, provider: "auto", model: "", base_url: "" };
    return writeAuxiliary(yaml, auxiliary);
  }

  auxiliary.title_generation = {
    ...current,
    enabled: current.enabled ?? true,
    provider: "custom",
    model: input.model,
    base_url: input.baseUrl,
    api_key: `\${${HERMES_API_KEY_ENV}}`,
  };

  return writeAuxiliary(yaml, auxiliary);
};

export const parseTitleGeneration = (yaml: string) => {
  const auxiliary = readAuxiliary(yaml);
  const block = asRecord(auxiliary.title_generation);
  if (Object.keys(block).length === 0) return null;
  return {
    enabled: block.enabled !== false,
    provider: typeof block.provider === "string" ? block.provider : null,
    model: typeof block.model === "string" ? block.model : null,
  };
};

export const removeAuxiliaryOverrides = (yaml: string) => upsertTitleGenerationBlock(yaml, null);
