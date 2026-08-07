export interface ComboModelEntry {
  model: string;
  weight?: number;
  disabled?: boolean;
}

export interface ComboRecord {
  id: string;
  name: string;
  models: Array<string | ComboModelEntry>;
  strategy?: string;
  config?: Record<string, boolean | number | string | undefined>;
  isActive?: boolean;
  system_message?: string;
  tool_filter_regex?: string;
  context_cache_protection?: boolean;
  requireToolCalling?: boolean;
}

export interface ComboMetrics {
  totalSuccesses: number;
  totalRequests: number;
  successRate: number;
  avgLatencyMs: number;
  fallbackRate: number;
  lastRoutingFailure?: {
    httpStatus?: number;
    modelStr?: string;
  };
}

/**
 * A row from `/api/provider-nodes` — a user-configured compatible endpoint.
 * Distinct from `ProviderConnection` (a credential row from `/api/providers`);
 * do not merge the two.
 */
export interface ProviderNode {
  id?: string;
  prefix?: string;
  name?: string;
  apiType?: string;
}

export type { ProviderConnection } from "@/shared/models/provider-connection";

export interface ComboTestResultItem {
  model: string;
  status: string;
  latencyMs?: number;
  error?: string;
  statusCode?: number;
}

export interface ComboTestResults {
  error?: string;
  resolvedBy?: string;
  results?: ComboTestResultItem[];
}

export type PricingByProvider = Record<string, Record<string, unknown>>;
/** `{ alias: "provider/model" }` — values are always the full model string. */
export type ModelAliases = Record<string, string>;
