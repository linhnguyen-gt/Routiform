/**
 * Google OAuth refresh-token exchange for the Antigravity provider.
 *
 * @module executors/antigravity/token-refresh
 */
import { OAUTH_ENDPOINTS } from "../../config/constants.ts";
import type { ProviderConfig } from "../base.ts";
import type { AntigravityCredentials, AntigravityLog } from "./types.ts";

export type RefreshedAntigravityTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  projectId?: string;
};

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

/** Returns null when there is nothing to refresh or the endpoint rejects the exchange. */
export async function refreshAntigravityTokens(
  config: ProviderConfig,
  credentials: AntigravityCredentials,
  log?: AntigravityLog
): Promise<RefreshedAntigravityTokens | null> {
  if (!credentials.refreshToken) return null;

  try {
    const response = await fetch(OAUTH_ENDPOINTS.google.token, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: credentials.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });

    if (!response.ok) return null;

    const tokens = (await response.json()) as GoogleTokenResponse;
    log?.info?.("TOKEN", "Antigravity refreshed");

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || credentials.refreshToken,
      expiresIn: tokens.expires_in,
      projectId: credentials.projectId,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log?.error?.("TOKEN", `Antigravity refresh error: ${msg}`);
    return null;
  }
}
