import { readFile, readdir } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { KIRO_CONFIG } from "../constants/oauth";

/**
 * Kiro OAuth Service
 * Supports multiple authentication methods:
 * 1. AWS Builder ID (Device Code Flow)
 * 2. AWS IAM Identity Center/IDC (Device Code Flow)
 * 3. Google/GitHub Social Login (Authorization Code Flow + Manual Callback)
 * 4. Import Token (Manual refresh token paste)
 */

const KIRO_AUTH_SERVICE = "https://prod.us-east-1.auth.desktop.kiro.dev";

export class KiroService {
  /**
   * Register OIDC client with AWS SSO
   * Returns clientId and clientSecret for device code flow
   */
  async registerClient(region: string = "us-east-1") {
    const endpoint = `https://oidc.${region}.amazonaws.com/client/register`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientName: KIRO_CONFIG.clientName,
        clientType: KIRO_CONFIG.clientType,
        scopes: KIRO_CONFIG.scopes,
        grantTypes: KIRO_CONFIG.grantTypes,
        issuerUrl: KIRO_CONFIG.issuerUrl,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to register client: ${error}`);
    }

    const data = await response.json();
    return {
      clientId: data.clientId,
      clientSecret: data.clientSecret,
      clientSecretExpiresAt: data.clientSecretExpiresAt,
    };
  }

  /**
   * Start device authorization for AWS Builder ID or IDC
   */
  async startDeviceAuthorization(
    clientId: string,
    clientSecret: string,
    startUrl: string,
    region: string = "us-east-1"
  ) {
    const endpoint = `https://oidc.${region}.amazonaws.com/device_authorization`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientId,
        clientSecret,
        startUrl,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to start device authorization: ${error}`);
    }

    const data = await response.json();
    return {
      deviceCode: data.deviceCode,
      userCode: data.userCode,
      verificationUri: data.verificationUri,
      verificationUriComplete: data.verificationUriComplete,
      expiresIn: data.expiresIn,
      interval: data.interval || 5,
    };
  }

  /**
   * Poll for token using device code (AWS Builder ID/IDC)
   */
  async pollDeviceToken(
    clientId: string,
    clientSecret: string,
    deviceCode: string,
    region: string = "us-east-1"
  ) {
    const endpoint = `https://oidc.${region}.amazonaws.com/token`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientId,
        clientSecret,
        deviceCode,
        grantType: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    const data = await response.json();

    // Handle pending/slow_down/errors
    if (!response.ok || data.error) {
      return {
        success: false,
        error: data.error,
        errorDescription: data.error_description,
        pending: data.error === "authorization_pending" || data.error === "slow_down",
      };
    }

    return {
      success: true,
      tokens: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn,
        tokenType: data.tokenType,
      },
    };
  }

  /**
   * Build Google/GitHub social login URL
   * Returns authorization URL for manual callback flow
   * Uses kiro:// custom protocol as required by AWS Cognito whitelist
   */
  buildSocialLoginUrl(provider: string, codeChallenge: string, state: string) {
    const idp = provider === "google" ? "Google" : "Github";
    // AWS Cognito only whitelists kiro:// protocol, not localhost
    const redirectUri = "kiro://kiro.kiroAgent/authenticate-success";
    return `${KIRO_AUTH_SERVICE}/login?idp=${idp}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}&prompt=select_account`;
  }

  /**
   * Exchange authorization code for tokens (Social Login)
   * Must use same redirect_uri as authorization request
   */
  async exchangeSocialCode(code: string, codeVerifier: string) {
    // Must match the redirect_uri used in buildSocialLoginUrl
    const redirectUri = "kiro://kiro.kiroAgent/authenticate-success";

    const response = await fetch(`${KIRO_AUTH_SERVICE}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      profileArn: data.profileArn,
      expiresIn: data.expiresIn || 3600,
    };
  }

  /**
   * Refresh token using refresh token
   */
  async refreshToken(refreshToken: string, providerSpecificData: Record<string, unknown> = {}) {
    const { _authMethod, clientId, clientSecret, region } = providerSpecificData;

    // AWS SSO OIDC refresh (Builder ID or IDC)
    if (clientId && clientSecret) {
      const endpoint = `https://oidc.${region || "us-east-1"}.amazonaws.com/token`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId,
          clientSecret,
          refreshToken,
          grantType: "refresh_token",
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Token refresh failed: ${error}`);
      }

      const data = await response.json();
      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || refreshToken,
        expiresIn: data.expiresIn,
      };
    }

    // Social auth refresh (Google/GitHub)
    const response = await fetch(`${KIRO_AUTH_SERVICE}/refreshToken`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || refreshToken,
      profileArn: data.profileArn,
      expiresIn: data.expiresIn || 3600,
    };
  }

  /**
   * Validate and import refresh token
   * Tries multiple strategies:
   * 1. Read client credentials from AWS SSO cache (for IDC/Builder ID tokens)
   * 2. Try social auth refresh endpoint (for Google/GitHub tokens)
   * 3. Register fresh OIDC client and try (last resort for Builder ID)
   */
  async validateImportToken(refreshToken: string) {
    // Validate token format
    if (!refreshToken.startsWith("aorAAAAAG")) {
      throw new Error("Invalid token format. Token should start with aorAAAAAG...");
    }

    const errors: string[] = [];

    // Strategy 1: Try to find matching client credentials from AWS SSO cache
    // This handles IDC and Builder ID tokens that were created with a specific client
    try {
      const cacheData = await this.findSSOCacheCredentials(refreshToken);
      if (cacheData) {
        const result = await this.refreshToken(refreshToken, {
          authMethod: cacheData.authMethod || "idc",
          clientId: cacheData.clientId,
          clientSecret: cacheData.clientSecret,
          region: cacheData.region || "us-east-1",
        });

        return {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken || refreshToken,
          profileArn: (result as Record<string, unknown>).profileArn as string | undefined,
          expiresIn: result.expiresIn,
          authMethod: cacheData.authMethod || "idc",
          clientId: cacheData.clientId,
          clientSecret: cacheData.clientSecret,
          clientSecretExpiresAt: cacheData.clientSecretExpiresAt,
          region: cacheData.region || "us-east-1",
        };
      }
    } catch (cacheError: unknown) {
      errors.push(
        `SSO cache: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`
      );
    }

    // Strategy 2: Try social auth refresh endpoint (Google/GitHub imported tokens)
    try {
      const result = await this.refreshToken(refreshToken);
      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken || refreshToken,
        profileArn: result.profileArn,
        expiresIn: result.expiresIn,
        authMethod: "imported",
      };
    } catch (socialError: unknown) {
      errors.push(
        `Social auth: ${socialError instanceof Error ? socialError.message : String(socialError)}`
      );
    }

    // Strategy 3: Register a fresh OIDC client (works for Builder ID, not IDC)
    try {
      const client = await this.registerClient("us-east-1");
      const result = await this.refreshToken(refreshToken, {
        authMethod: "builder-id",
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        region: "us-east-1",
      });

      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken || refreshToken,
        profileArn: (result as Record<string, unknown>).profileArn as string | undefined,
        expiresIn: result.expiresIn,
        authMethod: "builder-id",
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        clientSecretExpiresAt: client.clientSecretExpiresAt,
      };
    } catch (awsError: unknown) {
      errors.push(`AWS SSO: ${awsError instanceof Error ? awsError.message : String(awsError)}`);
    }

    throw new Error(`Token validation failed: ${errors.join(" | ")}`);
  }

  /**
   * Find client credentials from AWS SSO cache that match the given refresh token.
   * Kiro IDE stores:
   * - kiro-auth-token.json: { refreshToken, clientIdHash, authMethod, region }
   * - <clientIdHash>.json: { clientId, clientSecret, expiresAt }
   */
  private async findSSOCacheCredentials(refreshToken: string): Promise<{
    clientId: string;
    clientSecret: string;
    clientSecretExpiresAt?: string;
    authMethod?: string;
    region?: string;
  } | null> {
    const dataDir = process.env.DATA_DIR || join(homedir(), ".routiform");
    const candidatePaths = [
      join(homedir(), ".aws/sso/cache"),
      join(dataDir, ".aws/sso/cache"),
      process.env.AWS_SSO_CACHE_PATH,
      "/root/.aws/sso/cache",
      "/app/.aws/sso/cache",
    ].filter((p): p is string => Boolean(p));

    for (const cachePath of candidatePaths) {
      let files: string[];
      try {
        files = await readdir(cachePath);
      } catch {
        continue;
      }

      // Look for kiro-auth-token.json or kiro-auth-token-cli.json
      const tokenFiles = ["kiro-auth-token.json", "kiro-auth-token-cli.json"];

      for (const tokenFile of tokenFiles) {
        if (!files.includes(tokenFile)) continue;

        try {
          const content = await readFile(join(cachePath, tokenFile), "utf-8");
          const tokenData = JSON.parse(content);

          // Check if this token file matches the refresh token we're importing
          if (tokenData.refreshToken !== refreshToken) continue;

          // Found matching token file — now get client credentials
          const clientIdHash = tokenData.clientIdHash;
          if (!clientIdHash) continue;

          const clientFile = `${clientIdHash}.json`;
          if (!files.includes(clientFile)) continue;

          const clientContent = await readFile(join(cachePath, clientFile), "utf-8");
          const clientData = JSON.parse(clientContent);

          if (clientData.clientId && clientData.clientSecret) {
            return {
              clientId: clientData.clientId,
              clientSecret: clientData.clientSecret,
              clientSecretExpiresAt: clientData.expiresAt,
              authMethod: tokenData.authMethod?.toLowerCase() === "idc" ? "idc" : "builder-id",
              region: tokenData.region || "us-east-1",
            };
          }
        } catch {
          continue;
        }
      }

      // Fallback: scan all JSON files for matching refreshToken + find client by hash
      for (const file of files) {
        if (!file.endsWith(".json") || file.startsWith("kiro-auth-token")) continue;

        try {
          const content = await readFile(join(cachePath, file), "utf-8");
          const data = JSON.parse(content);

          // This might be a token file with refreshToken and clientIdHash
          if (data.refreshToken === refreshToken && data.clientIdHash) {
            const clientFile = `${data.clientIdHash}.json`;
            if (!files.includes(clientFile)) continue;

            const clientContent = await readFile(join(cachePath, clientFile), "utf-8");
            const clientData = JSON.parse(clientContent);

            if (clientData.clientId && clientData.clientSecret) {
              return {
                clientId: clientData.clientId,
                clientSecret: clientData.clientSecret,
                clientSecretExpiresAt: clientData.expiresAt,
                authMethod: data.authMethod?.toLowerCase() === "idc" ? "idc" : "builder-id",
                region: data.region || "us-east-1",
              };
            }
          }
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  /**
   * Fetch user email from access token (optional, for display)
   */
  extractEmailFromJWT(accessToken: string) {
    try {
      const parts = accessToken.split(".");
      if (parts.length !== 3) return null;

      // Decode payload (add padding if needed)
      let payload = parts[1];
      while (payload.length % 4) {
        payload += "=";
      }

      const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
      return decoded.email || decoded.preferred_username || decoded.sub;
    } catch {
      return null;
    }
  }
}
