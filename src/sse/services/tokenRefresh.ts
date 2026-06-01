// Re-export from open-sse with local logger
import * as log from "../utils/logger";
import { updateProviderConnection, resolveProxyForProvider } from "@/lib/localDb";
import {
  TOKEN_EXPIRY_BUFFER_MS as BUFFER_MS,
  getRefreshLeadMs as _getRefreshLeadMs,
  refreshAccessToken as _refreshAccessToken,
  refreshClaudeOAuthToken as _refreshClaudeOAuthToken,
  refreshGoogleToken as _refreshGoogleToken,
  refreshCodexToken as _refreshCodexToken,
  refreshIflowToken as _refreshIflowToken,
  refreshGitHubToken as _refreshGitHubToken,
  refreshCopilotToken as _refreshCopilotToken,
  getAccessToken as _getAccessToken,
  refreshTokenByProvider as _refreshTokenByProvider,
  formatProviderCredentials as _formatProviderCredentials,
  getAllAccessTokens as _getAllAccessTokens,
} from "@routiform/open-sse/services/tokenRefresh.ts";

export const TOKEN_EXPIRY_BUFFER_MS = BUFFER_MS;
export const getRefreshLeadMs = (provider: string) => _getRefreshLeadMs(provider);

export const refreshAccessToken = async (
  provider: string,
  refreshToken: string,
  credentials: Record<string, unknown>
) => {
  const proxy = await resolveProxyForProvider(provider);
  return _refreshAccessToken(provider, refreshToken, credentials, log, proxy);
};

export const refreshClaudeOAuthToken = async (refreshToken: string) => {
  const proxy = await resolveProxyForProvider("claude");
  return _refreshClaudeOAuthToken(refreshToken, log, proxy);
};

export const refreshGoogleToken = async (
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  provider: string = "gemini"
) => {
  const proxy = await resolveProxyForProvider(provider);
  return _refreshGoogleToken(refreshToken, clientId, clientSecret, log, proxy);
};

export const refreshCodexToken = async (refreshToken: string) => {
  const proxy = await resolveProxyForProvider("codex");
  return _refreshCodexToken(refreshToken, log, proxy);
};

export const refreshIflowToken = async (refreshToken: string) => {
  const proxy = await resolveProxyForProvider("qoder");
  return _refreshIflowToken(refreshToken, log, proxy);
};

export const refreshGitHubToken = async (refreshToken: string) => {
  const proxy = await resolveProxyForProvider("github");
  return _refreshGitHubToken(refreshToken, log, proxy);
};

export const refreshCopilotToken = async (githubAccessToken: string) => {
  const proxy = await resolveProxyForProvider("github");
  return _refreshCopilotToken(githubAccessToken, log, proxy);
};

export const getAccessToken = async (provider: string, credentials: Record<string, unknown>) => {
  const proxy = await resolveProxyForProvider(provider);
  return _getAccessToken(provider, credentials, log, proxy);
};

export const refreshTokenByProvider = async (
  provider: string,
  credentials: Record<string, unknown>
) => {
  const proxy = await resolveProxyForProvider(provider);
  return _refreshTokenByProvider(provider, credentials, log, proxy);
};

export const formatProviderCredentials = (provider: string, credentials: Record<string, unknown>) =>
  _formatProviderCredentials(provider, credentials, log);

export const getAllAccessTokens = (userInfo: Record<string, unknown>) =>
  _getAllAccessTokens(userInfo, log);

// Local-specific: Update credentials in localDb
export async function updateProviderCredentials(connectionId: string, newCredentials: unknown) {
  try {
    const updates: Record<string, unknown> = {};

    if (newCredentials && typeof newCredentials === "object" && "accessToken" in newCredentials) {
      updates.accessToken = newCredentials.accessToken;
    }
    if (newCredentials && typeof newCredentials === "object" && "refreshToken" in newCredentials) {
      updates.refreshToken = newCredentials.refreshToken;
    }
    if (
      newCredentials &&
      typeof newCredentials === "object" &&
      "expiresIn" in newCredentials &&
      typeof newCredentials.expiresIn === "number"
    ) {
      updates.expiresAt = new Date(Date.now() + newCredentials.expiresIn * 1000).toISOString();
      updates.expiresIn = newCredentials.expiresIn;
    }
    if (
      newCredentials &&
      typeof newCredentials === "object" &&
      "providerSpecificData" in newCredentials
    ) {
      updates.providerSpecificData = newCredentials.providerSpecificData;
    }

    const result = await updateProviderConnection(connectionId, updates);
    log.info("TOKEN_REFRESH", "Credentials updated in localDb", {
      connectionId,
      success: !!result,
    });
    return !!result;
  } catch (error) {
    log.error("TOKEN_REFRESH", "Error updating credentials in localDb", {
      connectionId,
      error: (error as Error).message,
    });
    return false;
  }
}

// Local-specific: Check and refresh token proactively
export async function checkAndRefreshToken(provider: string, credentials: unknown) {
  if (!credentials || typeof credentials !== "object") {
    return credentials;
  }

  let updatedCredentials = { ...credentials } as Record<string, unknown>;

  // Check regular token expiry
  if (updatedCredentials.expiresAt && typeof updatedCredentials.expiresAt === "string") {
    const expiresAt = new Date(updatedCredentials.expiresAt).getTime();
    const now = Date.now();
    const refreshLeadMs = getRefreshLeadMs(provider);

    if (expiresAt - now < refreshLeadMs) {
      log.info("TOKEN_REFRESH", "Token expiring soon, refreshing proactively", {
        provider,
        expiresIn: Math.round((expiresAt - now) / 1000),
        refreshLeadMs,
      });

      const newCredentials = await getAccessToken(provider, updatedCredentials);
      const newCreds = newCredentials as Record<string, unknown>;
      if (newCredentials && newCreds.accessToken) {
        await updateProviderCredentials(String(updatedCredentials.connectionId), newCredentials);

        updatedCredentials = {
          ...updatedCredentials,
          accessToken: newCreds.accessToken,
          refreshToken: newCreds.refreshToken || updatedCredentials.refreshToken,
          expiresAt:
            typeof newCreds.expiresIn === "number"
              ? new Date(Date.now() + newCreds.expiresIn * 1000).toISOString()
              : updatedCredentials.expiresAt,
        };
      }
    }
  }

  // Check GitHub copilot token expiry
  const providerData =
    updatedCredentials.providerSpecificData &&
    typeof updatedCredentials.providerSpecificData === "object"
      ? (updatedCredentials.providerSpecificData as Record<string, unknown>)
      : {};
  if (provider === "github" && typeof providerData.copilotTokenExpiresAt === "number") {
    const copilotExpiresAt = providerData.copilotTokenExpiresAt * 1000;
    const now = Date.now();

    if (copilotExpiresAt - now < TOKEN_EXPIRY_BUFFER_MS) {
      log.info("TOKEN_REFRESH", "Copilot token expiring soon, refreshing proactively", {
        provider,
        expiresIn: Math.round((copilotExpiresAt - now) / 1000),
      });

      const copilotToken = await refreshCopilotToken(String(updatedCredentials.accessToken));
      if (copilotToken) {
        const copilotResult = copilotToken as Record<string, unknown>;
        const currentProviderData =
          updatedCredentials.providerSpecificData &&
          typeof updatedCredentials.providerSpecificData === "object"
            ? (updatedCredentials.providerSpecificData as Record<string, unknown>)
            : {};
        await updateProviderCredentials(String(updatedCredentials.connectionId), {
          providerSpecificData: {
            ...currentProviderData,
            copilotToken: String(copilotResult.token),
            copilotTokenExpiresAt: copilotResult.expiresAt,
          },
        });

        updatedCredentials.providerSpecificData = {
          ...currentProviderData,
          copilotToken: String(copilotResult.token),
          copilotTokenExpiresAt: copilotResult.expiresAt,
        };
        // Sync to top-level so buildHeaders() picks up the fresh token
        updatedCredentials.copilotToken = String(copilotResult.token);
      }
    }
  }

  return updatedCredentials;
}

// Local-specific: Refresh GitHub and Copilot tokens together
export async function refreshGitHubAndCopilotTokens(credentials: unknown) {
  const creds = credentials as Record<string, unknown>;
  const newGitHubCredentials = await refreshGitHubToken(String(creds.refreshToken));
  if (newGitHubCredentials?.accessToken) {
    const copilotToken = await refreshCopilotToken(newGitHubCredentials.accessToken);
    if (copilotToken) {
      const copilotResult = copilotToken as Record<string, unknown>;
      return {
        ...newGitHubCredentials,
        providerSpecificData: {
          copilotToken: copilotResult.token,
          copilotTokenExpiresAt: copilotResult.expiresAt,
        },
      };
    }
  }
  return newGitHubCredentials;
}
