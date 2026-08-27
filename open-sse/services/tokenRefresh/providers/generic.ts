import { PROVIDERS } from "../../../config/constants.ts";
import { dispatchTokenRequest, mapSnakeCaseTokens } from "../dispatch.ts";

/**
 * Refresh OAuth access token using refresh token
 */
export async function refreshAccessToken(
  provider,
  refreshToken,
  credentials,
  log,
  proxyConfig = null
) {
  void credentials; // kept for signature stability; the endpoint config carries the client pair
  const config = PROVIDERS[provider];

  const refreshEndpoint = config?.refreshUrl || config?.tokenUrl;
  if (!config || !refreshEndpoint) {
    log?.warn?.("TOKEN_REFRESH", `No refresh endpoint configured for provider: ${provider}`);
    return null;
  }

  if (!refreshToken) {
    log?.warn?.("TOKEN_REFRESH", `No refresh token available for provider: ${provider}`);
    return null;
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (config.clientId) params.set("client_id", config.clientId);
  if (config.clientSecret) params.set("client_secret", config.clientSecret);

  return dispatchTokenRequest({
    endpoint: refreshEndpoint,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params,
    label: `token for ${provider}`,
    log,
    proxyConfig,
    mapResponse: mapSnakeCaseTokens(refreshToken),
  });
}
