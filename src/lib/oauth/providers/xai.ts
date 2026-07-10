import { XAI_CONFIG } from "../constants/oauth";

function authHeaders() {
  return {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
    "User-Agent": "routiform/oauth",
  };
}

function parseJwtEmail(token: string | undefined): string | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4 !== 0) payload += "=";
    const claims = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    return typeof claims?.email === "string" ? claims.email : null;
  } catch {
    return null;
  }
}

export const xai = {
  config: XAI_CONFIG,
  flowType: "device_code",
  fixedPort: 56121,
  callbackPath: "/callback",

  requestDeviceCode: async (config) => {
    const response = await fetch(config.deviceCodeUrl, {
      method: "POST",
      headers: authHeaders(),
      body: new URLSearchParams({
        client_id: config.clientId,
        scope: config.scope,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`xAI device code request failed: ${error}`);
    }

    const data = await response.json();
    if (!data.device_code || !data.user_code || !data.verification_uri) {
      throw new Error("xAI device code response is missing required fields");
    }

    return {
      device_code: data.device_code,
      user_code: data.user_code,
      verification_uri: data.verification_uri,
      verification_uri_complete: data.verification_uri_complete,
      expires_in: data.expires_in,
      interval: data.interval || 5,
    };
  },

  pollToken: async (config, deviceCode) => {
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: authHeaders(),
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: config.clientId,
        device_code: deviceCode,
      }),
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: "invalid_response", error_description: text };
    }

    return {
      ok: response.ok,
      data,
    };
  },

  buildAuthUrl: (config, redirectUri, state, codeChallenge) => {
    const params = {
      response_type: "code",
      client_id: config.clientId,
      redirect_uri: redirectUri || config.redirectUri,
      scope: config.scope,
      code_challenge: codeChallenge,
      code_challenge_method: config.codeChallengeMethod,
      ...config.extraParams,
      state,
    };
    const queryString = Object.entries(params)
      .map(([key, value]) => `${key}=${encodeURIComponent(value as string)}`)
      .join("&");
    return `${config.authorizeUrl}?${queryString}`;
  },

  exchangeToken: async (config, code, redirectUri, codeVerifier) => {
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: authHeaders(),
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.clientId,
        code,
        redirect_uri: redirectUri || config.redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`xAI token exchange failed: ${error}`);
    }

    return await response.json();
  },

  mapTokens: (tokens) => {
    const email = parseJwtEmail(tokens.id_token) || parseJwtEmail(tokens.access_token) || null;
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      expiresIn: typeof tokens.expires_in === "number" ? tokens.expires_in : 3600,
      email,
      tokenType: tokens.token_type,
      scope: tokens.scope,
      providerSpecificData: {
        authMethod: "oauth",
        scope: tokens.scope || null,
      },
    };
  },
};
