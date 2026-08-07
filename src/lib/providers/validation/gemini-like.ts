import { safeOutboundFetch } from "@/lib/network/safeOutboundFetch";
import { applyCustomUserAgent } from "./http-utils";

export async function validateGeminiLikeProvider({
  apiKey,
  baseUrl,
  authType,
  providerSpecificData = {},
}: {
  apiKey: string;
  baseUrl: string;
  authType?: string;
  providerSpecificData?: Record<string, unknown>;
}) {
  if (!baseUrl) {
    return { valid: false, error: "Missing base URL" };
  }

  // Use the correct auth header based on provider config: an API key goes in
  // x-goog-api-key, an OAuth token in Authorization.
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authType === "oauth") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else {
    headers["x-goog-api-key"] = apiKey;
  }
  applyCustomUserAgent(headers, providerSpecificData);

  const response = await safeOutboundFetch(
    baseUrl,
    { method: "GET", headers },
    { timeoutMs: 15_000 }
  );

  if (response.ok) {
    return { valid: true, error: null };
  }

  // 429 = rate limited, but auth is valid
  if (response.status === 429) {
    return { valid: true, error: null };
  }

  // Google returns 400 (not 401/403) for invalid API keys on the models endpoint.
  // Parse the response body to detect auth failures.
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    const isAuthError = (body: Record<string, unknown>) => {
      const errorObj = body?.error as Record<string, unknown> | undefined;
      const message = typeof errorObj?.message === "string" ? errorObj.message.toLowerCase() : "";
      const details = Array.isArray(errorObj?.details) ? errorObj.details : [];
      const reason =
        details.length > 0 && typeof details[0] === "object" && details[0] !== null
          ? (details[0] as Record<string, unknown>).reason
          : "";
      const status = typeof errorObj?.status === "string" ? errorObj.status : "";
      const authPatterns = [
        "api key not valid",
        "api key expired",
        "api key invalid",
        "API_KEY_INVALID",
        "API_KEY_EXPIRED",
        "PERMISSION_DENIED",
        "UNAUTHENTICATED",
      ];
      return authPatterns.some(
        (p) => message.includes(p.toLowerCase()) || reason === p || status === p
      );
    };

    try {
      const body = await response.json();
      if (isAuthError(body)) {
        return { valid: false, error: "Invalid API key" };
      }
      // 401/403 are always auth failures even without matching patterns
      if (response.status === 401 || response.status === 403) {
        return { valid: false, error: "Invalid API key" };
      }
    } catch {
      // Unparseable body — 401/403 are always auth failures
      if (response.status === 401 || response.status === 403) {
        return { valid: false, error: "Invalid API key" };
      }
      // 400 without parseable body — likely auth issue for Gemini
      return { valid: false, error: "Invalid API key" };
    }
  }

  return { valid: false, error: `Validation failed: ${response.status}` };
}
