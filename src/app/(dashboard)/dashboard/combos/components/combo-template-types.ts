import type { AvailableModelGroup } from "@/shared/models/available-models";
import type { ProviderConnection } from "@/shared/models/provider-connection";
import type { PricingByProvider, ProviderNode } from "./combo-types";

export type TemplateProviderFilter = "free" | "paid-subscription" | "priced" | "any";
export type TemplateRanking = "free-tier" | "fitness-desc" | "price-asc" | "spread";

/** Free-tier provenance. A = OAuth-free, B = zero-priced now, C = has-a-free-tier. */
export type FreeTier = "a" | "b" | "c";

export interface TemplateSelector {
  providerFilter: TemplateProviderFilter;
  ranking: TemplateRanking;
  /** Below this, the template is unsatisfiable and renders disabled. */
  minModels: number;
  maxModels: number;
  maxPerProvider: number;
  /** Weight assigned to each resolved model. 0 for every current template. */
  weightMode: "zero" | "balanced-100";
}

export interface ComboTemplate {
  id: string;
  icon: string;
  titleKey: string;
  descKey: string;
  fallbackTitle: string;
  fallbackDesc: string;
  strategy: string;
  suggestedName: string;
  config: Record<string, number | boolean>;
  selector: TemplateSelector;
}

export interface ResolvedTemplateModel {
  model: string;
  weight: number;
  /** Tier C only: the user's key may be on a paid plan. Phase 05 renders a badge. */
  limitedFreeTier?: boolean;
}

export type TemplateResolution =
  | { ok: true; models: ResolvedTemplateModel[]; requested: number }
  | { ok: false; reasonKey: string; reasonParams: Record<string, string> };

export interface ResolveTemplateInput {
  template: ComboTemplate;
  /** Phase 03 output, already provider-ordered. */
  groups: AvailableModelGroup[];
  connections: ProviderConnection[];
  pricingByProvider: PricingByProvider;
  providerNodes: ProviderNode[];
}
