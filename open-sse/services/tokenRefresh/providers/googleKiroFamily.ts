import { PROVIDERS, OAUTH_ENDPOINTS } from "../../../config/constants.ts";
import { dispatchTokenRequest, mapSnakeCaseTokens, mapCamelCaseTokens } from "../dispatch.ts";

/**
 * Specialized refresh for Google providers (Gemini, Antigravity)
 */
export async function refreshGoogleToken(
  refreshToken,
  clientId,
  clientSecret,
  log,
  proxyConfig = null
) {
  return dispatchTokenRequest({
    endpoint: OAUTH_ENDPOINTS.google.token,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    label: "Google token",
    log,
    proxyConfig,
    mapResponse: mapSnakeCaseTokens(refreshToken),
  });
}

/**
 * Specialized refresh for Kiro (AWS CodeWhisperer) tokens
 * Supports both AWS SSO OIDC (Builder ID/IDC) and Social Auth (Google/GitHub)
 */
export async function refreshKiroToken(
  refreshToken,
  providerSpecificData,
  log,
  proxyConfig = null
) {
  const authMethod = providerSpecificData?.authMethod;
  const clientId = providerSpecificData?.clientId;
  const clientSecret = providerSpecificData?.clientSecret;
  const region = providerSpecificData?.region;

  // AWS SSO OIDC (Builder ID or IDC)
  // If clientId and clientSecret exist, assume AWS SSO OIDC (default to builder-id if authMethod not specified)
  if (clientId && clientSecret) {
    const isIDC = authMethod === "idc";
    const endpoint =
      isIDC && region
        ? `https://oidc.${region}.amazonaws.com/token`
        : "https://oidc.us-east-1.amazonaws.com/token";

    return dispatchTokenRequest({
      endpoint,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        clientId: clientId,
        clientSecret: clientSecret,
        refreshToken: refreshToken,
        grantType: "refresh_token",
      }),
      label: "Kiro AWS token",
      log,
      proxyConfig,
      mapResponse: mapCamelCaseTokens(refreshToken),
    });
  }

  // Social Auth (Google/GitHub) - use Kiro's refresh endpoint
  return dispatchTokenRequest({
    endpoint: PROVIDERS.kiro.tokenUrl,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      refreshToken: refreshToken,
    }),
    label: "Kiro social token",
    log,
    proxyConfig,
    mapResponse: mapCamelCaseTokens(refreshToken),
  });
}

/**
 * Specialized refresh for Qoder OAuth tokens
 */
export async function refreshIflowToken(refreshToken, log, proxyConfig = null) {
  if (!OAUTH_ENDPOINTS.qoder.token || !PROVIDERS.qoder.clientId || !PROVIDERS.qoder.clientSecret) {
    log?.warn?.(
      "TOKEN_REFRESH",
      "Qoder OAuth refresh skipped: browser OAuth is not configured in this environment"
    );
    return null;
  }

  const basicAuth = btoa(`${PROVIDERS.qoder.clientId}:${PROVIDERS.qoder.clientSecret}`);

  return dispatchTokenRequest({
    endpoint: OAUTH_ENDPOINTS.qoder.token,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: PROVIDERS.qoder.clientId,
      client_secret: PROVIDERS.qoder.clientSecret,
    }),
    label: "Qoder token",
    log,
    proxyConfig,
    mapResponse: mapSnakeCaseTokens(refreshToken),
  });
}
