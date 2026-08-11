/**
 * Shared first-slash split for combo model strings.
 *
 * Mirrors the routing-time semantics of `parseModel`
 * (`open-sse/services/model.ts:124-166`): the provider reference is everything
 * before the FIRST slash, and the model id is the entire remainder — which may
 * itself contain slashes (`nvidia/meta/llama-3.3-70b-instruct`).
 *
 * Two deliberate divergences from `parseModel`, both of which must be kept in
 * mind when changing either side:
 *
 * 1. The trailing `[1m]` extended-context suffix is NOT stripped here.
 *    `parseModel` removes it before splitting; this helper retains it in
 *    `modelId`. Display and pricing lookups do not care, and stripping it would
 *    make the returned string no longer equal to the stored combo entry.
 * 2. No sanitization. `parseModel` rejects path traversal and control
 *    characters because its output reaches routing. This helper is used only
 *    for DISPLAY and LOOKUP — never to build a filesystem path or an outbound
 *    URL — so it is NOT a sanitizer and must not be mistaken for one. Routing
 *    still goes through `parseModel`.
 *
 * Keep this in step with `parseModel`'s first-slash behaviour.
 */

import {
  PROVIDER_ID_TO_ALIAS,
  resolveProviderIdFromRef,
} from "@routiform/open-sse/config/providerModels.ts";

export interface SplitModelString {
  /** Text before the first slash — a provider id, provider alias, or node prefix. */
  providerRef: string;
  /** Everything after the first slash. May itself contain slashes. */
  modelId: string;
}

/**
 * Split a `provider/model` string on its first slash.
 *
 * Returns `null` when the value carries no usable provider reference — no
 * slash, an empty provider ref, or an empty model id. A slash-less combo entry
 * is a nested combo name or a model alias, never a `provider/model` pair, so
 * `null` is a meaningful answer and not an error.
 */
export function splitModelString(value: string): SplitModelString | null {
  if (!value || typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const firstSlash = trimmed.indexOf("/");
  if (firstSlash <= 0) return null;

  const providerRef = trimmed.slice(0, firstSlash).trim();
  const modelId = trimmed.slice(firstSlash + 1).trim();
  if (!providerRef || !modelId) return null;

  return { providerRef, modelId };
}

/**
 * Rewrite a `provider/model` key so the provider segment is the canonical provider id.
 *
 * Model pickers emit `alias/model` while the registry and every server-side default map
 * are keyed by id, so the same model reaches storage under two different names depending
 * on which surface wrote it. Settings that are keyed by model — reasoning-effort defaults
 * above all — must agree on one spelling or an override written from one surface looks
 * unset from another.
 *
 * Values with no usable provider reference are returned unchanged, as are references to
 * providers outside the registry (custom nodes).
 */
export function canonicalizeProviderModelKey(value: string): string {
  const split = splitModelString(value);
  if (!split) return value;
  const providerId = resolveProviderIdFromRef(split.providerRef);
  return providerId === split.providerRef ? value : `${providerId}/${split.modelId}`;
}

/**
 * Inverse of {@link canonicalizeProviderModelKey}: rewrite the provider segment to the
 * alias model pickers use, so a key that came back from the server can be looked up
 * against the values a picker emits.
 */
export function toPickerProviderModelKey(value: string): string {
  const split = splitModelString(value);
  if (!split) return value;
  const alias = PROVIDER_ID_TO_ALIAS[split.providerRef];
  return !alias || alias === split.providerRef ? value : `${alias}/${split.modelId}`;
}

/** Re-key a `provider/model` map with one of the two helpers above. */
export function rekeyProviderModelMap<T>(
  map: Record<string, T>,
  rekey: (key: string) => string
): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(map)) result[rekey(key)] = value;
  return result;
}
