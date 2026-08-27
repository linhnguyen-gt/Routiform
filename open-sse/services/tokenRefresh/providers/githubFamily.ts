import { PROVIDERS, OAUTH_ENDPOINTS } from "../../../config/constants.ts";
import { dispatchTokenRequest, mapSnakeCaseTokens } from "../dispatch.ts";

/**
 * Specialized refresh for GitHub Copilot OAuth tokens
 */
export async function refreshGitHubToken(refreshToken, log, proxyConfig = null) {
  return dispatchTokenRequest({
    endpoint: OAUTH_ENDPOINTS.github.token,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: PROVIDERS.github.clientId,
      client_secret: PROVIDERS.github.clientSecret,
    }),
    label: "GitHub token",
    log,
    proxyConfig,
    mapResponse: mapSnakeCaseTokens(refreshToken),
  });
}

/**
 * Refresh GitHub Copilot token using GitHub access token
 */
export async function refreshCopilotToken(githubAccessToken, log, proxyConfig = null) {
  return dispatchTokenRequest({
    endpoint: "https://api.github.com/copilot_internal/v2/token",
    method: "GET",
    headers: {
      Authorization: `token ${githubAccessToken}`,
      "User-Agent": "GithubCopilot/1.0",
      "Editor-Version": "vscode/1.100.0",
      "Editor-Plugin-Version": "copilot/1.300.0",
      Accept: "application/json",
    },
    label: "Copilot token",
    log,
    proxyConfig,
    mapResponse: (data) => ({
      result: {
        token: data.token,
        expiresAt: data.expires_at,
      },
      info: {
        hasToken: !!data.token,
        expiresAt: data.expires_at,
      },
    }),
  });
}
