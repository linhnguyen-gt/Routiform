/**
 * Google OAuth refresh-token exchange for the Antigravity provider.
 *
 * @module executors/antigravity/token-refresh
 */
import { getAccessToken } from "../../services/tokenRefresh.ts";
import type { ProviderConfig } from "../base.ts";
import type { AntigravityCredentials, AntigravityLog } from "./types.ts";

export type RefreshedAntigravityTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  projectId?: string;
};
/**
 * Refresh via the centralized tokenRefresh service so concurrent 401-triggered
 * refreshes for the same credential share one in-flight Google OAuth exchange
 * (refreshPromiseCache dedup) instead of racing N parallel ones. The service's
 * `antigravity` branch performs the identical refresh_token grant against
 * OAUTH_ENDPOINTS.google.token with PROVIDERS.antigravity clientId/clientSecret
 * (plus proxy support). The subscription cache key derives from the access
 * token prefix, so token rotation stays safe.
 *
 * `config` is kept in the signature for backward compatibility with callers;
 * the client id/secret now come from the provider registry inside the service.
 */
export async function refreshAntigravityTokens(
  config: ProviderConfig,
  credentials: AntigravityCredentials,
  log?: AntigravityLog
): Promise<RefreshedAntigravityTokens | null> {
  void config;
  if (!credentials.refreshToken) return null;

  try {
    const tokens = await getAccessToken("antigravity", credentials, log);
    if (!tokens || !tokens.accessToken) return null;

    log?.info?.("TOKEN", "Antigravity refreshed");
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || credentials.refreshToken,
      expiresIn: tokens.expiresIn,
      projectId: credentials.projectId,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log?.error?.("TOKEN", `Antigravity refresh error: ${msg}`);
    return null;
  }
}
