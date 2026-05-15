import { GEMINI_CONFIG } from "../constants/oauth";

export const gemini = {
  config: GEMINI_CONFIG,
  flowType: "authorization_code",
  buildAuthUrl: (config, redirectUri, state) => {
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: config.scopes.join(" "),
      state: state,
      access_type: "offline",
      prompt: "consent",
    });
    return `${config.authorizeUrl}?${params.toString()}`;
  },
  exchangeToken: async (config, code, redirectUri) => {
    const bodyParams: Record<string, string> = {
      grant_type: "authorization_code",
      client_id: config.clientId,
      code: code,
      redirect_uri: redirectUri,
    };

    if (config.clientSecret) {
      bodyParams.client_secret = config.clientSecret;
    }
    // When GEMINI_OAUTH_CLIENT_SECRET is not set, try the exchange without it
    // first. The built-in default credentials work on localhost without a
    // client secret. If Google rejects the request, we surface the actionable
    // error message below.

    let response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(bodyParams),
    });

    if (!response.ok) {
      const errText = await response.text();
      const lower = errText.toLowerCase();
      // Google requires client_secret for OAuth2 non-PKCE flows. When it is
      // not set and Google rejects with "client_secret is missing", surface a
      // clear actionable message so users know how to fix it.
      if (
        !config.clientSecret &&
        (lower.includes("client_secret is missing") || lower.includes("client_secret"))
      ) {
        throw new Error(
          "Gemini CLI OAuth requires GEMINI_OAUTH_CLIENT_SECRET to be set.\n" +
            "In Docker: add 'GEMINI_OAUTH_CLIENT_SECRET=<your-secret>' to your docker-compose.yml env.\n" +
            "In npm: add it to ~/.routiform/.env\n" +
            "Obtain the client secret from https://console.cloud.google.com/apis/credentials\n" +
            "for the same OAuth 2.0 Client ID configured as GEMINI_OAUTH_CLIENT_ID."
        );
      }
      throw new Error(`Token exchange failed: ${errText}`);
    }

    return await response.json();
  },
  postExchange: async (tokens) => {
    const userInfoRes = await fetch(`${GEMINI_CONFIG.userInfoUrl}?alt=json`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = userInfoRes.ok ? await userInfoRes.json() : {};

    let projectId = "";
    try {
      const projectRes = await fetch(
        "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            metadata: {
              ideType: "IDE_UNSPECIFIED",
              platform: "PLATFORM_UNSPECIFIED",
              pluginType: "GEMINI",
            },
          }),
        }
      );
      if (projectRes.ok) {
        const data = await projectRes.json();
        projectId = data.cloudaicompanionProject?.id || data.cloudaicompanionProject || "";
      }
    } catch (e) {
      console.log("Failed to fetch project ID:", e);
    }

    return { userInfo, projectId };
  },
  mapTokens: (tokens, extra) => ({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    scope: tokens.scope,
    email: extra?.userInfo?.email,
    projectId: extra?.projectId,
  }),
};
