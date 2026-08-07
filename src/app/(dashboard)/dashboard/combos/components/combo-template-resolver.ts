/**
 * Resolves a combo template's declarative selector against the user's real connected
 * providers and their real catalogs. Pure: no React, no fetch, no server imports.
 *
 * Candidates come from phase 03's `deriveAvailableModels` output, which is the same
 * derivation the model picker renders. That is what makes template output and picker
 * output agree by construction rather than by convention.
 */

import { AI_PROVIDERS, resolveProviderId } from "@/shared/constants/providers";
import type { AvailableModel, AvailableModelGroup } from "@/shared/models/available-models";
import type { ProviderConnection } from "@/shared/models/provider-connection";
import {
  distributeWeights,
  findModelPrice,
  getProviderDisplayLabel,
  hasFreeTier,
  isDeprecatedProvider,
  isOauthFreeProvider,
  isPaidSubscriptionProvider,
  isTemplateEligibleConnection,
  resolveFreeTier,
  scoreModelFitness,
} from "./combo-template-policies";
import type {
  FreeTier,
  ResolvedTemplateModel,
  ResolveTemplateInput,
  TemplateProviderFilter,
  TemplateResolution,
} from "./combo-template-types";

const MAX_NAMED_PROVIDERS = 3;
const TIER_RANK: Record<FreeTier, number> = { a: 0, b: 1, c: 2 };

interface Candidate {
  model: AvailableModel;
  groupIndex: number;
  modelIndex: number;
  price: number | null;
  tier: FreeTier | null;
}

/** Filters that classify a provider by how it bills, so a custom node cannot qualify. */
function isBillingSensitiveFilter(filter: TemplateProviderFilter): boolean {
  return filter === "free" || filter === "paid-subscription";
}

function providerQualifiesForFilter(providerId: string, filter: TemplateProviderFilter): boolean {
  if (isDeprecatedProvider(providerId)) return false;
  switch (filter) {
    case "free":
      // Tier B is per-model, so provider-level qualification is A ∪ C. A model that only
      // qualifies via a zero price is still admitted by the per-model check below.
      return isOauthFreeProvider(providerId) || hasFreeTier(providerId);
    case "paid-subscription":
      return isPaidSubscriptionProvider(providerId);
    case "priced":
    case "any":
    default:
      return true;
  }
}

function namesOf(providerIds: string[]): string {
  return providerIds.slice(0, MAX_NAMED_PROVIDERS).map(getProviderDisplayLabel).join(", ");
}

export function resolveTemplate(input: ResolveTemplateInput): TemplateResolution {
  const { template, groups, connections, pricingByProvider, providerNodes } = input;
  const { selector } = template;

  const eligibleConnections = connections.filter(isTemplateEligibleConnection);
  const eligibleProviderIds = new Set(
    eligibleConnections.map((c) => resolveProviderId(c.provider) || c.provider)
  );

  const candidateGroups = groups.filter(
    (group) => eligibleProviderIds.has(group.providerId) && !isDeprecatedProvider(group.providerId)
  );

  const candidates: Candidate[] = [];
  candidateGroups.forEach((group, groupIndex) => {
    // A custom provider node's user-chosen prefix carries no billing signal, so it can
    // only be classified by accident under `free` / `paid-subscription`. Excluded there,
    // eligible everywhere else — see phase 04's decision table.
    if (group.isCustom && isBillingSensitiveFilter(selector.providerFilter)) return;
    if (!group.isCustom && !providerQualifiesForFilter(group.providerId, selector.providerFilter)) {
      return;
    }

    group.models.forEach((model, modelIndex) => {
      const price = findModelPrice(model, pricingByProvider, providerNodes);

      let tier: FreeTier | null = null;
      if (selector.providerFilter === "free") {
        tier = resolveFreeTier(model, price);
        if (tier === null) return;
      }
      if (selector.providerFilter === "priced" && price === null) return;

      candidates.push({ model, groupIndex, modelIndex, price, tier });
    });
  });

  if (candidates.length === 0) {
    return unsatisfiable(input, eligibleConnections, eligibleProviderIds, groups);
  }

  const ranked = rankCandidates(candidates, selector.ranking);
  const capped = capPerProvider(ranked, selector.maxPerProvider);
  const ordered =
    selector.ranking === "spread"
      ? interleaveByProvider(capped)
      : orderGlobally(capped, selector.ranking);
  const selected = ordered.slice(0, selector.maxModels);

  if (selected.length < selector.minModels) {
    return unsatisfiable(input, eligibleConnections, eligibleProviderIds, groups);
  }

  const models: ResolvedTemplateModel[] = selected.map((candidate) => ({
    model: candidate.model.value,
    weight: 0,
    ...(candidate.tier === "c" ? { limitedFreeTier: true } : {}),
  }));

  return {
    ok: true,
    models: selector.weightMode === "balanced-100" ? distributeWeights(models) : models,
    requested: selector.maxModels,
  };
}

/** Rank within each provider group. Every sort is stable, so ties keep catalog order. */
function rankCandidates(candidates: Candidate[], ranking: string): Candidate[] {
  if (ranking === "spread") return candidates;
  const byGroup = new Map<number, Candidate[]>();
  for (const candidate of candidates) {
    const list = byGroup.get(candidate.groupIndex) || [];
    list.push(candidate);
    byGroup.set(candidate.groupIndex, list);
  }
  return [...byGroup.keys()]
    .sort((a, b) => a - b)
    .flatMap((groupIndex) => [...(byGroup.get(groupIndex) ?? [])].sort(comparatorFor(ranking)));
}

function orderGlobally(candidates: Candidate[], ranking: string): Candidate[] {
  return [...candidates].sort(comparatorFor(ranking));
}

function comparatorFor(ranking: string): (a: Candidate, b: Candidate) => number {
  if (ranking === "free-tier") {
    return (a, b) => {
      const tierDelta = TIER_RANK[a.tier ?? "c"] - TIER_RANK[b.tier ?? "c"];
      if (tierDelta !== 0) return tierDelta;
      return a.groupIndex - b.groupIndex || a.modelIndex - b.modelIndex;
    };
  }
  if (ranking === "price-asc") {
    return (a, b) => {
      const priceDelta = priceKey(a.price) - priceKey(b.price);
      if (priceDelta !== 0) return priceDelta;
      return a.groupIndex - b.groupIndex || a.modelIndex - b.modelIndex;
    };
  }
  if (ranking === "fitness-desc") {
    return (a, b) => {
      const fitnessDelta = scoreModelFitness(b.model) - scoreModelFitness(a.model);
      if (fitnessDelta !== 0) return fitnessDelta;
      return a.groupIndex - b.groupIndex || a.modelIndex - b.modelIndex;
    };
  }
  return (a, b) => a.groupIndex - b.groupIndex || a.modelIndex - b.modelIndex;
}

/** Non-finite and unknown prices sort last, matching `sortModelsByCost`. */
function priceKey(price: number | null): number {
  return price === null || !Number.isFinite(price) ? Number.POSITIVE_INFINITY : price;
}

function capPerProvider(candidates: Candidate[], maxPerProvider: number): Candidate[] {
  const taken = new Map<number, number>();
  return candidates.filter((candidate) => {
    const count = taken.get(candidate.groupIndex) ?? 0;
    if (count >= maxPerProvider) return false;
    taken.set(candidate.groupIndex, count + 1);
    return true;
  });
}

/** Round-robin across providers so the head of the list is maximally diverse. */
function interleaveByProvider(candidates: Candidate[]): Candidate[] {
  const byGroup = new Map<number, Candidate[]>();
  for (const candidate of candidates) {
    const list = byGroup.get(candidate.groupIndex) || [];
    list.push(candidate);
    byGroup.set(candidate.groupIndex, list);
  }

  const queues = [...byGroup.keys()].sort((a, b) => a - b).map((key) => byGroup.get(key) ?? []);
  const out: Candidate[] = [];
  const longest = Math.max(0, ...queues.map((queue) => queue.length));
  for (let round = 0; round < longest; round += 1) {
    for (const queue of queues) {
      const candidate = queue[round];
      if (candidate) out.push(candidate);
    }
  }
  return out;
}

/**
 * Never silently widen a filter. A "Free Stack" that quietly includes a paid provider is
 * a worse failure than a disabled button, because the user pays for it.
 */
function unsatisfiable(
  input: ResolveTemplateInput,
  eligibleConnections: ProviderConnection[],
  eligibleProviderIds: Set<string>,
  groups: AvailableModelGroup[]
): TemplateResolution {
  const filter = input.template.selector.providerFilter;

  if (eligibleConnections.length === 0) {
    return { ok: false, reasonKey: "templateNeedsAnyProvider", reasonParams: {} };
  }

  // M8: a connected provider whose catalog endpoint failed disappears from `groups`.
  // Telling that user to "connect" what they already connected is the wrong message.
  const groupProviderIds = new Set(groups.map((group) => group.providerId));
  const connectedButNoModels = [...eligibleProviderIds].filter(
    (providerId) =>
      providerQualifiesForFilter(providerId, filter) && !groupProviderIds.has(providerId)
  );
  if (connectedButNoModels.length > 0) {
    return {
      ok: false,
      reasonKey: "templateProviderNoModels",
      reasonParams: { providers: namesOf(connectedButNoModels) },
    };
  }

  if (filter === "priced") {
    return { ok: false, reasonKey: "templateNeedsPricing", reasonParams: {} };
  }

  const suggestions = Object.keys(AI_PROVIDERS).filter(
    (providerId) =>
      !eligibleProviderIds.has(providerId) && providerQualifiesForFilter(providerId, filter)
  );

  return {
    ok: false,
    reasonKey: suggestions.length > 0 ? "templateNeedsProviders" : "templateNeedsAnyProvider",
    reasonParams: suggestions.length > 0 ? { providers: namesOf(suggestions) } : {},
  };
}
