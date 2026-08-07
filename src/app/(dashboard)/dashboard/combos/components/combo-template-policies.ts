/**
 * Policy helpers for combo template resolution — which providers qualify, what a
 * model costs, and how weights are distributed.
 *
 * PROVIDER UNIVERSE: these helpers read `AI_PROVIDERS`, which is WIDER than the model
 * picker's `OAUTH ∪ FREE ∪ APIKEY` (see the header of
 * `src/shared/models/available-models.ts`). `cliproxyapi` and `ollama-local` exist here
 * but not there. That is deliberate — a template must not be blind to a provider the
 * router can actually serve.
 *
 * WHY THREE FREE TIERS. Five mutually-unaware "free" signals exist in this repo:
 *   1. FREE_PROVIDERS                — kiro, qoder, gemini-cli (deprecated)
 *   2. FREE_APIKEY_PROVIDER_IDS      — an empty Set today; a no-op
 *   3. ProviderDefinition.hasFree    — 12 API-key providers
 *   4. FREE_TIER_CATALOG             — 18 documentary entries, self-described as static
 *   5. zero-cost rows in constants/pricing — NOT stable: src/lib/db/settings.ts:106-178
 *      lets LiteLLM / models.dev / user layers overwrite the zeros
 * Qualifying on (1) alone would leave most users with an empty Free Stack — the bug this
 * exists to fix. Qualifying on (3) alone would silently add keys that may sit on a paid
 * plan. So the composite is the union of three tiers, ranked A → B → C, with tier C
 * visibly badged. (2) and (4) stay unused.
 */

import { getTaskFitness } from "@routiform/open-sse/services/autoCombo/taskFitness.ts";
import type { AvailableModel } from "@/shared/models/available-models";
import type { ProviderConnection } from "@/shared/models/provider-connection";
import { AI_PROVIDERS, FREE_PROVIDERS } from "@/shared/constants/providers";
import { OAUTH_PROVIDERS } from "@/shared/constants/providers";
import type { PricingByProvider, ProviderNode } from "./combo-types";
import type { FreeTier } from "./combo-template-types";

type ProviderRecord = { name?: string; deprecated?: boolean; hasFree?: boolean };

function providerDefinition(providerId: string): ProviderRecord | undefined {
  return (AI_PROVIDERS as Record<string, ProviderRecord>)[providerId];
}

export function isDeprecatedProvider(providerId: string): boolean {
  return providerDefinition(providerId)?.deprecated === true;
}

export function getProviderDisplayLabel(providerId: string): string {
  return providerDefinition(providerId)?.name || providerId;
}

/** Tier A: FREE_PROVIDERS minus deprecated. */
export function isOauthFreeProvider(providerId: string): boolean {
  const entry = (FREE_PROVIDERS as Record<string, ProviderRecord>)[providerId];
  return !!entry && entry.deprecated !== true;
}

/** Tier C: ProviderDefinition.hasFree === true. */
export function hasFreeTier(providerId: string): boolean {
  return providerDefinition(providerId)?.hasFree === true;
}

/** An OAuth subscription the user pays for — OAuth and not free by any tier. */
export function isPaidSubscriptionProvider(providerId: string): boolean {
  const isOauth = Object.prototype.hasOwnProperty.call(OAUTH_PROVIDERS, providerId);
  if (!isOauth) return false;
  if (isDeprecatedProvider(providerId)) return false;
  return !isOauthFreeProvider(providerId) && !hasFreeTier(providerId);
}

/**
 * Tier of a model, or null when it does not qualify as free at all.
 *
 * Order is load-bearing: A before B before C. `price === null` means pricing is
 * UNAVAILABLE, not that the model costs something — it falls through to the tier-C
 * check so a pricing outage can never drop a provider that qualifies under A or C.
 * Tier B can only ever ADD providers.
 */
export function resolveFreeTier(model: AvailableModel, price: number | null): FreeTier | null {
  if (isOauthFreeProvider(model.providerId)) return "a";
  if (price === 0) return "b";
  if (hasFreeTier(model.providerId)) return "c";
  return null;
}

/**
 * Templates consider a connection only when it is genuinely usable.
 *
 * Intentionally stricter than the model picker. The picker shows every connection
 * on purpose (see the comment in combos/page.tsx fetchData) because hiding a provider
 * from a manual choice is worse than showing a broken one. A template is an automatic
 * action whose whole value is producing a combo that works on the first request, so a
 * connection with no credentials or a failed last test is excluded. "unknown" passes —
 * it is the create-time default and means untested, not failed. Do not unify these.
 */
export function isTemplateEligibleConnection(connection: ProviderConnection): boolean {
  if (!connection || typeof connection.provider !== "string" || !connection.provider) return false;
  if (isDeprecatedProvider(connection.provider)) return false;
  if (connection.credentialsConfigured !== true) return false;
  if (connection.testStatus === "error") return false;
  // SQLite stores this as 0/1; only an explicit falsy value disqualifies.
  if (connection.isActive === false || connection.isActive === 0) return false;
  return true;
}

/**
 * Input price for a model, or null when no pricing row exists at all.
 *
 * MIN-11: this must agree with ComboFormModal's `hasPricingForModel`, which is plain
 * object truthiness — a row of `{ input: 0 }` counts as PRICED there. So a present row
 * never yields null. A present row whose `input` is not a finite number yields
 * +Infinity: still "priced" (agreeing with the component), sorts last under price-asc,
 * and never falsely earns tier B.
 */
export function findModelPrice(
  model: AvailableModel,
  pricingByProvider: PricingByProvider,
  providerNodes: ProviderNode[]
): number | null {
  const providerRef = model.prefix;
  const matchedNode = providerNodes.find(
    (node) => node.id === providerRef || node.prefix === providerRef
  );

  // Same candidate fan-out as ComboFormModal.hasPricingForModel — /api/pricing is not
  // keyed consistently by alias.
  const candidates = [providerRef];
  if (matchedNode?.apiType) candidates.push(matchedNode.apiType);
  if (matchedNode?.name) candidates.push(String(matchedNode.name).toLowerCase());

  for (const candidate of candidates) {
    const row = pricingByProvider?.[candidate]?.[model.id];
    if (!row) continue;
    const input = (row as { input?: unknown }).input;
    const numeric = typeof input === "number" ? input : Number(input);
    return Number.isFinite(numeric) ? numeric : Number.POSITIVE_INFINITY;
  }

  return null;
}

/** Static model-quality ranking. The only one in the repo that needs no runtime state. */
export function scoreModelFitness(model: AvailableModel): number {
  return getTaskFitness(model.id, "default");
}

/**
 * Spread 100 across the active entries: floor(100 / activeCount) each, remainder onto
 * the first active entry. Disabled entries keep their weight.
 *
 * Replaces the component-scoped `let activeIndex = 0` that ComboFormModal declared in
 * its render body and mutated inside `handleAutoBalance`'s map without ever resetting
 * it. That only worked because a re-render rebound the variable; two calls in one tick
 * left the remainder unallocated, the total at 99, and the save blocked. The counter
 * here is local to the call, so the function is idempotent.
 */
export function distributeWeights<T extends { weight: number; disabled?: boolean }>(
  models: T[]
): T[] {
  const activeCount = models.filter((m) => !m.disabled).length;
  if (activeCount === 0) return models.map((m) => ({ ...m }));

  const base = Math.floor(100 / activeCount);
  const remainder = 100 - base * activeCount;

  let activeIndex = 0;
  return models.map((model) => {
    if (model.disabled) return { ...model };
    const weight = activeIndex === 0 ? base + remainder : base;
    activeIndex += 1;
    return { ...model, weight };
  });
}
