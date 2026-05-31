/**
 * Combo Configuration Resolver
 *
 * Implements 3-layer cascade: Global Defaults → Provider Overrides → Per-Combo Config
 * Most specific wins.
 */

import type { DedupMode } from "./requestDedup.ts";

const DEFAULT_COMBO_CONFIG = {
  strategy: "priority",
  maxRetries: 1,
  retryDelayMs: 2000,
  timeoutMs: 600000,
  concurrencyPerModel: 3, // max simultaneous requests per model (round-robin)
  queueTimeoutMs: 30000, // max wait time in semaphore queue (round-robin)
  healthCheckEnabled: true,
  healthCheckTimeoutMs: 3000,
  maxComboDepth: 3,
  trackMetrics: true,
};

export interface ComboDedupeOverride {
  mode?: DedupMode;
  ttlMs?: number;
  enabled?: boolean;
}

/**
 * Read dedupe override from combo config.
 * Returns null when the combo has no opinion (caller should fall back to runtime config).
 */
export function readComboDedupeOverride(
  combo: { config?: { dedupe?: unknown } | null } | null | undefined
): ComboDedupeOverride | null {
  const raw = combo?.config?.dedupe;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: ComboDedupeOverride = {};
  if (r.mode === "off" || r.mode === "shadow" || r.mode === "enforce") {
    out.mode = r.mode;
  }
  if (typeof r.ttlMs === "number" && Number.isFinite(r.ttlMs) && r.ttlMs > 0) {
    out.ttlMs = r.ttlMs;
  }
  if (typeof r.enabled === "boolean") {
    out.enabled = r.enabled;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Resolve effective config for a combo, applying cascade:
 *   DEFAULT_COMBO_CONFIG → settings.comboDefaults → settings.providerOverrides[provider] → combo.config
 *
 * @param {Object} combo - The combo object { config, ... }
 * @param {Object} settings - App settings from localDb
 * @param {string} [provider] - Optional provider to apply provider-level overrides
 * @returns {Object} Resolved config
 */
export function resolveComboConfig(combo, settings, provider?: string | null) {
  const global = settings?.comboDefaults || {};
  const providerOverride = provider ? settings?.providerOverrides?.[provider] || {} : {};
  const comboConfig = combo?.config || {};

  // Clean undefined values before spreading
  const clean = (obj) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));

  return {
    ...DEFAULT_COMBO_CONFIG,
    ...clean(global),
    ...clean(providerOverride),
    ...clean(comboConfig),
  };
}

/**
 * Get the default combo config (used when no overrides exist)
 */
export function getDefaultComboConfig() {
  return { ...DEFAULT_COMBO_CONFIG };
}
