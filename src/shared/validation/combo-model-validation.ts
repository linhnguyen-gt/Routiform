/**
 * Save-time advisory check for a combo's model entries.
 *
 * This is NOT the sanitisation boundary. `parseModel`
 * (`open-sse/services/model.ts:135-146`) already rejects path traversal and control
 * characters at request time, and remains the sanitiser. This module only answers a
 * narrower question: would the router be able to resolve this entry at all, and does the
 * model appear in the static catalog we happen to ship?
 *
 * It mirrors the router's own resolution order
 * (`src/sse/services/model.ts:41-92`) — combo names and aliases, then provider-node
 * prefixes, then the provider registry, then `stripModelPrefix` — so a save is rejected
 * only for input the router could not route either.
 */

import { AI_PROVIDERS } from "@/shared/constants/providers";
import { isValidModel, PROVIDER_ID_TO_ALIAS, PROVIDER_MODELS } from "@/shared/constants/models";
import { REGISTRY } from "@routiform/open-sse/config/registry-providers.ts";
import { splitModelString } from "@/shared/models/model-string";

/** Matches `allowedProviders`' `z.string().max(200)` in `schemas/combo.ts:18`. */
const MAX_ECHOED_LENGTH = 200;

/*
 * Two passthrough lists exist in this codebase and NEITHER is a superset of the other:
 *   AI_PROVIDERS[*].passthroughModels (9)  — exclusive: getgoapi, laozhang, novita, piapi
 *   REGISTRY[*].passthroughModels    (11)  — exclusive: antigravity, alibaba, cline,
 *                                            devin, kilocode, ollama-cloud (+ all aliases)
 * Union, never replace. Combo entries carry either an id or an alias, so seed both.
 * Measured: 24 keys. Reconciling the two at source is the real fix and is out of scope.
 */
const PASSTHROUGH_UNION: ReadonlySet<string> = (() => {
  const union = new Set<string>();
  for (const [key, provider] of Object.entries(AI_PROVIDERS)) {
    if ((provider as Record<string, unknown>).passthroughModels) union.add(key);
  }
  for (const entry of Object.values(REGISTRY)) {
    if (!entry?.passthroughModels) continue;
    if (entry.id) union.add(entry.id);
    if (entry.alias) union.add(entry.alias);
  }
  return union;
})();

const ID_TO_ALIAS: Record<string, string> = PROVIDER_ID_TO_ALIAS;
const ALIAS_TO_ID: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [id, alias] of Object.entries(ID_TO_ALIAS)) {
    if (alias) out[alias] = id;
  }
  return out;
})();

interface CatalogModel {
  id: string;
}

/**
 * `PROVIDER_MODELS` is keyed by a MIX of provider ids (25) and aliases (30), so a combo
 * entry written with the other spelling misses a catalog that exists. Try the ref, then
 * its alias, then its id, before concluding the catalog is unknown.
 */
function catalogFor(ref: string): CatalogModel[] | undefined {
  const table = PROVIDER_MODELS as unknown as Record<string, CatalogModel[] | undefined>;
  return table[ref] ?? table[ID_TO_ALIAS[ref]] ?? table[ALIAS_TO_ID[ref]];
}

function resolvesToKnownProvider(ref: string): boolean {
  if (Object.prototype.hasOwnProperty.call(AI_PROVIDERS, ref)) return true;
  if (Object.prototype.hasOwnProperty.call(ID_TO_ALIAS, ref)) return true;
  if (Object.prototype.hasOwnProperty.call(ALIAS_TO_ID, ref)) return true;
  return catalogFor(ref) !== undefined;
}

function truncate(value: string): string {
  return value.length > MAX_ECHOED_LENGTH ? `${value.slice(0, MAX_ECHOED_LENGTH)}…` : value;
}

export interface ComboModelValidationInput {
  models: Array<string | { model?: unknown }>;
  knownComboNames: ReadonlySet<string>;
  knownModelAliases: ReadonlySet<string> | null;
  /**
   * `prefix` values from provider_nodes, types openai-compatible + anthropic-compatible
   * only. `null` = the read failed → FAIL OPEN, skip all model validation.
   */
  knownNodePrefixes: ReadonlySet<string> | null;
  /** Router strips unmatched prefixes when true → downgrade hard errors to warnings. */
  stripModelPrefix: boolean;
  /** Entries already stored on this combo; exempt from the hard error. */
  existingModels?: ReadonlySet<string>;
}

export interface ComboModelValidationResult {
  errors: string[];
  /** Provider refs whose catalog did not list the model, in first-seen order. */
  warnedProviders: string[];
  warnings: string[];
}

function entryToString(entry: string | { model?: unknown }): string {
  if (typeof entry === "string") return entry;
  const model = entry?.model;
  return typeof model === "string" ? model : "";
}

/**
 * Pure: every set the cascade consults is supplied by the caller. A `null` set means its
 * read failed, and a failed read must never turn into a rejection — see the fail-open note
 * at the call sites.
 */
export function validateComboModels(input: ComboModelValidationInput): ComboModelValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const warnedProviders: string[] = [];

  // FAIL OPEN. Without provider nodes we cannot tell a custom-node prefix from a typo,
  // and without the alias store we cannot tell a slash-bearing alias from one either.
  if (input.knownNodePrefixes === null || input.knownModelAliases === null) {
    return { errors, warnings, warnedProviders };
  }

  const nodePrefixes = input.knownNodePrefixes;
  const modelAliases = input.knownModelAliases;

  for (const rawEntry of input.models ?? []) {
    const entry = entryToString(rawEntry).trim();
    if (!entry) continue;

    // Combo names may contain "/" (`schemas/combo.ts:14`) and nested combos are matched
    // against the FULL entry string, so this must precede any split.
    if (input.knownComboNames.has(entry)) continue;
    if (modelAliases.has(entry)) continue;

    const split = splitModelString(entry);
    // Slash-less entries are nested-combo names or model aliases, never provider/model.
    if (!split) continue;

    const { providerRef, modelId } = split;

    if (nodePrefixes.has(providerRef)) continue;

    if (!resolvesToKnownProvider(providerRef)) {
      // The router strips an unmatched prefix and re-resolves the bare model when this
      // setting is on (`src/sse/services/model.ts:82-92`), so the entry routes today.
      if (input.stripModelPrefix || input.existingModels?.has(entry)) {
        warnings.push(truncate(entry));
        if (!warnedProviders.includes(providerRef)) warnedProviders.push(providerRef);
        continue;
      }
      errors.push(`Unknown provider "${truncate(providerRef)}" in model "${truncate(entry)}"`);
      continue;
    }

    if (PASSTHROUGH_UNION.has(providerRef)) continue;
    if (isValidModel(providerRef, modelId)) continue;

    const catalog = catalogFor(providerRef);
    // A provider with no static catalog is one whose real catalog is fetched live, and
    // the live list overrides the static one. An absent or empty table cannot prove a
    // model wrong — it can only stay silent. `registry-generators.ts` omits empty keys
    // rather than emitting [], so the `undefined` half is the one that actually fires.
    if (catalog === undefined || catalog.length === 0) continue;
    if (catalog.some((model) => model?.id === modelId)) continue;

    warnings.push(truncate(entry));
    if (!warnedProviders.includes(providerRef)) warnedProviders.push(providerRef);
  }

  return { errors, warnings, warnedProviders };
}

/**
 * Attaches `warnings` to the combo entity only when there are any, so no client can come
 * to depend on the key's presence.
 *
 * `warnings` is a transient per-request diagnostic, NOT part of the combo entity. It is
 * never persisted, never returned by GET /api/combos, and never echoed back on a
 * subsequent PUT. Clients must not cache it as a field of the record.
 *
 * The body stays the bare record rather than a `{ combo, warnings }` envelope, because
 * `bin/cli/combo.mjs:96` reads `data.id` from it.
 */
export function withComboWarnings<T extends object>(
  combo: T,
  result: ComboModelValidationResult
): T | (T & { warnings: string[] }) {
  if (result.warnings.length === 0) return combo;
  console.warn(
    `[combos] saved with ${result.warnings.length} model warning(s) for ` +
      `${result.warnedProviders.join(", ")}:`,
    result.warnings
  );
  return { ...combo, warnings: result.warnings };
}

/** Exported for the unit test that guards the two-source union against "simplification". */
export const __PASSTHROUGH_UNION_FOR_TESTS = PASSTHROUGH_UNION;
