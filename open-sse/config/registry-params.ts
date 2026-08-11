/**
 * Model parameter helpers: unsupported params, force params, default params, reasoning effort.
 */

import { REGISTRY } from "./registry-providers.ts";
import { getRegistryEntry } from "./registry-lookup.ts";

const _unsupportedParamsMap = new Map<string, readonly string[]>();
const _forceParamsMap = new Map<string, Record<string, unknown>>();
const _defaultParamsMap = new Map<string, Record<string, unknown>>();

// Use globalThis to survive Next.js hot reload
const _globalKey = Symbol.for("__routiform_customDefaultParamsMap__");

interface GlobalWithCustomParams {
  [key: symbol]: Map<string, Record<string, unknown>>;
}

if (!(globalThis as GlobalWithCustomParams)[_globalKey]) {
  (globalThis as GlobalWithCustomParams)[_globalKey] = new Map<string, Record<string, unknown>>();
}
const _customDefaultParamsMap: Map<string, Record<string, unknown>> = (
  globalThis as GlobalWithCustomParams
)[_globalKey];

// Union across providers — mirrors the model-defaults API enum. `none` is
// OpenAI/Codex-only and `max` is Anthropic-only; downstream tuning downgrades
// a level the target provider does not support.
const MODEL_REASONING_EFFORT_VALUES = new Set(["none", "low", "medium", "high", "xhigh", "max"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cloneParams(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value));
}

function mergeDefaultParams(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      merged[key] = { ...current, ...value };
      continue;
    }
    merged[key] = value;
  }
  return merged;
}

function normalizeProviderModelKey(provider: string, modelId: string): string | null {
  const entry = getRegistryEntry(String(provider || "").trim());
  const normalizedModelId = String(modelId || "")
    .trim()
    .toLowerCase();
  if (!entry || !normalizedModelId) return null;
  return `${entry.id}:${normalizedModelId}`;
}

function normalizeExternalProviderModelKey(key: string): string | null {
  const raw = String(key || "").trim();
  const slashIndex = raw.indexOf("/");
  if (slashIndex <= 0 || slashIndex >= raw.length - 1) return null;
  const provider = raw.slice(0, slashIndex);
  const model = raw.slice(slashIndex + 1);
  return normalizeProviderModelKey(provider, model);
}

function toExternalProviderModelKey(internalKey: string): string {
  const sep = internalKey.indexOf(":");
  if (sep <= 0 || sep >= internalKey.length - 1) return internalKey;
  const provider = internalKey.slice(0, sep);
  const model = internalKey.slice(sep + 1);
  return `${provider}/${model}`;
}

function extractReasoningEffort(params: Record<string, unknown>): string | null {
  if (!isPlainObject(params.reasoning)) return null;
  const effort = params.reasoning.effort;
  if (typeof effort !== "string") return null;
  const normalized = effort.trim().toLowerCase();
  if (!MODEL_REASONING_EFFORT_VALUES.has(normalized)) return null;
  return normalized;
}

for (const entry of Object.values(REGISTRY)) {
  for (const model of entry.models) {
    const normalizedModelId = String(model.id || "").toLowerCase();
    if (model.unsupportedParams && !_unsupportedParamsMap.has(model.id)) {
      _unsupportedParamsMap.set(model.id, model.unsupportedParams);
    }
    if (model.forceParams && normalizedModelId && !_forceParamsMap.has(normalizedModelId)) {
      _forceParamsMap.set(normalizedModelId, model.forceParams);
    }
    if (model.defaultParams && normalizedModelId) {
      _defaultParamsMap.set(`${entry.id}:${normalizedModelId}`, model.defaultParams);
    }
  }
}

/**
 * Get unsupported parameters for a specific model.
 * Uses O(1) precomputed lookup. Also handles prefixed model IDs
 * (e.g., "openai/o3" → strips prefix and looks up "o3").
 * Returns empty array if no restrictions are defined.
 */
export function getUnsupportedParams(provider: string, modelId: string): readonly string[] {
  const entry = getRegistryEntry(provider);
  const modelEntry = entry?.models.find((m) => m.id === modelId);
  if (modelEntry?.unsupportedParams) return modelEntry.unsupportedParams;

  const cached = _unsupportedParamsMap.get(modelId);
  if (cached) return cached;

  if (modelId.includes("/")) {
    const bareId = modelId.split("/").pop() || "";
    const bare = _unsupportedParamsMap.get(bareId);
    if (bare) return bare;
  }

  return [];
}

/**
 * Get forced parameter values for a specific model.
 * Some models (e.g. Kimi K2.5) require certain parameters to have fixed values
 * (e.g. temperature must be 1). Returns the merged forceParams object or null.
 */
export function getForceParams(provider: string, modelId: string): Record<string, unknown> | null {
  const normalizedModelId = String(modelId || "").toLowerCase();

  const entry = getRegistryEntry(provider);
  const modelEntry = entry?.models.find(
    (m) => String(m.id || "").toLowerCase() === normalizedModelId
  );
  if (modelEntry?.forceParams) return modelEntry.forceParams;

  const cached = _forceParamsMap.get(normalizedModelId);
  if (cached) return cached;

  if (normalizedModelId.includes("/")) {
    const bareId = normalizedModelId.split("/").pop() || "";
    const bare = _forceParamsMap.get(bareId);
    if (bare) return bare;
  }

  return null;
}

/**
 * Replace runtime custom model-default parameter overrides.
 * Expected input shape: { "provider/model": { ...defaultParams } }
 */
export function setCustomModelDefaultParams(
  overrides: Record<string, Record<string, unknown>>
): void {
  console.log(
    `[ModelDefaults] setCustomModelDefaultParams called with ${Object.keys(overrides || {}).length} entries`
  );

  _customDefaultParamsMap.clear();
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return;

  for (const [key, value] of Object.entries(overrides)) {
    if (!isPlainObject(value) || Object.keys(value).length === 0) continue;
    const normalizedKey = normalizeExternalProviderModelKey(key);
    if (!normalizedKey) {
      console.warn(`[ModelDefaults] Failed to normalize key: ${key}`);
      continue;
    }
    _customDefaultParamsMap.set(normalizedKey, cloneParams(value));
    console.log(`[ModelDefaults] Stored in map: ${key} -> ${normalizedKey}`, value);
  }
  console.log(
    `[ModelDefaults] Total entries in _customDefaultParamsMap: ${_customDefaultParamsMap.size}`
  );
}

/**
 * Get runtime custom model-default parameter overrides.
 * Returns shape: { "provider/model": { ...defaultParams } }
 */
export function getCustomModelDefaultParams(): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of _customDefaultParamsMap.entries()) {
    result[toExternalProviderModelKey(key)] = cloneParams(value);
  }
  return result;
}

export function getBuiltInModelDefaultParams(): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of _defaultParamsMap.entries()) {
    result[toExternalProviderModelKey(key)] = cloneParams(value);
  }
  return result;
}

/**
 * Set reasoning effort override for a specific provider/model.
 */
export function setModelReasoningEffortDefault(
  provider: string,
  modelId: string,
  effort: string
): boolean {
  const normalizedKey = normalizeProviderModelKey(provider, modelId);
  const normalizedEffort = String(effort || "")
    .trim()
    .toLowerCase();
  if (!normalizedKey || !MODEL_REASONING_EFFORT_VALUES.has(normalizedEffort)) return false;
  _customDefaultParamsMap.set(normalizedKey, { reasoning: { effort: normalizedEffort } });
  return true;
}

/**
 * Remove reasoning effort override for a specific provider/model.
 */
export function removeModelReasoningEffortDefault(provider: string, modelId: string): boolean {
  const normalizedKey = normalizeProviderModelKey(provider, modelId);
  if (!normalizedKey) return false;
  return _customDefaultParamsMap.delete(normalizedKey);
}

/**
 * Replace runtime reasoning effort overrides with { "provider/model": effort }.
 */
export function setCustomModelReasoningEffortDefaults(overrides: Record<string, string>): void {
  const next: Record<string, Record<string, unknown>> = {};
  if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
    console.log("[ModelDefaults] Setting custom reasoning effort defaults:", overrides);
    for (const [key, effort] of Object.entries(overrides)) {
      const normalizedEffort = String(effort || "")
        .trim()
        .toLowerCase();
      if (!MODEL_REASONING_EFFORT_VALUES.has(normalizedEffort)) continue;

      // Keep original key format (cx/gpt-5.4), let setCustomModelDefaultParams normalize it
      next[key] = { reasoning: { effort: normalizedEffort } };
      console.log(`[ModelDefaults] Registered ${key} -> effort: ${normalizedEffort}`);
    }
  }
  setCustomModelDefaultParams(next);
}

export function getBuiltInModelReasoningEffortDefaults(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, params] of _defaultParamsMap.entries()) {
    const effort = extractReasoningEffort(params);
    if (!effort) continue;
    result[toExternalProviderModelKey(key)] = effort;
  }
  return result;
}

export function getCustomModelReasoningEffortDefaults(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, params] of _customDefaultParamsMap.entries()) {
    const effort = extractReasoningEffort(params);
    if (!effort) continue;
    result[toExternalProviderModelKey(key)] = effort;
  }
  return result;
}

export function getEffectiveModelReasoningEffortDefaults(): Record<string, string> {
  return {
    ...getBuiltInModelReasoningEffortDefaults(),
    ...getCustomModelReasoningEffortDefaults(),
  };
}

/**
 * Get model-level default parameter values for a provider/model pair.
 * Defaults are applied only when the request does not already provide a value.
 */
export function getDefaultParams(
  provider: string,
  modelId: string
): Record<string, unknown> | null {
  const normalizedModelId = String(modelId || "")
    .trim()
    .toLowerCase();
  const entry = getRegistryEntry(provider);
  if (!entry || !normalizedModelId) return null;

  const directKey = `${entry.id}:${normalizedModelId}`;
  const bareId = normalizedModelId.includes("/") ? normalizedModelId.split("/").pop() || "" : "";
  const bareKey = bareId ? `${entry.id}:${bareId}` : "";

  console.log(`[ModelDefaults] Looking up defaults for provider=${provider}, model=${modelId}`);
  console.log(`[ModelDefaults] Lookup keys: directKey=${directKey}, bareKey=${bareKey}`);
  console.log(
    `[ModelDefaults] Map size: ${_customDefaultParamsMap.size}, has directKey: ${_customDefaultParamsMap.has(directKey)}`
  );

  // Debug: print all keys in map
  if (_customDefaultParamsMap.size > 0) {
    console.log(`[ModelDefaults] All keys in map:`, Array.from(_customDefaultParamsMap.keys()));
  }

  const builtIn =
    _defaultParamsMap.get(directKey) || (bareKey ? _defaultParamsMap.get(bareKey) : null);
  const custom =
    _customDefaultParamsMap.get(directKey) ||
    (bareKey ? _customDefaultParamsMap.get(bareKey) : null);

  console.log(`[ModelDefaults] Found: builtIn=${!!builtIn}, custom=${!!custom}`);

  if (builtIn && custom) return mergeDefaultParams(cloneParams(builtIn), cloneParams(custom));
  if (custom) return cloneParams(custom);
  if (builtIn) return cloneParams(builtIn);
  return null;
}

/**
 * Get provider category: "oauth" or "apikey"
 * Used by the resilience layer to apply different cooldown/backoff profiles.
 * @param {string} provider - Provider ID or alias
 * @returns {"oauth"|"apikey"}
 */
export function getProviderCategory(provider: string): "oauth" | "apikey" {
  const entry = getRegistryEntry(provider);
  if (!entry) return "apikey"; // Safe default for unknown providers
  return entry.authType === "apikey" ? "apikey" : "oauth";
}
