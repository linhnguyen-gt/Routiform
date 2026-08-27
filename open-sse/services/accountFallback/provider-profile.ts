import { PROVIDER_PROFILES } from "../../config/constants.ts";
import { getProviderCategory } from "../../config/registry-params.ts";

// ─── Provider Profile Helper ────────────────────────────────────────────────

/**
 * Get the resilience profile for a provider (oauth or apikey).
 * @param {string} provider - Provider ID or alias
 * @returns {import('../config/constants.js').PROVIDER_PROFILES['oauth']}
 */
export function getProviderProfile(provider) {
  const category = getProviderCategory(provider);
  return PROVIDER_PROFILES[category] ?? PROVIDER_PROFILES.apikey;
}
