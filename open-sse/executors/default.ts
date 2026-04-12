import { BaseExecutor } from "./base.ts";
import { PROVIDERS, OAUTH_ENDPOINTS as _OAUTH_ENDPOINTS } from "../config/constants.ts";
import { getAccessToken } from "../services/tokenRefresh.ts";
import { getRotatingApiKey } from "../services/apiKeyRotator.ts";
import {
  buildClaudeCodeCompatibleHeaders,
  CLAUDE_CODE_COMPATIBLE_DEFAULT_CHAT_PATH,
  joinClaudeCodeCompatibleUrl,
} from "../services/claudeCodeCompatible.ts";
import { isClaudeCodeCompatible } from "../services/provider.ts";
import { buildClineHeaders } from "../services/clineAuth.ts";

function getOpenRouterAttributionHeaders() {
  const refererCandidates = [
    process.env.ROUTIFORM_PUBLIC_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.BASE_URL,
    process.env.ROUTIFORM_BASE_URL,
    "https://github.com/linhnguyen-gt/Routiform",
  ];
  const referer =
    refererCandidates.find((value) => {
      if (typeof value !== "string" || value.trim().length === 0) return false;
      try {
        const url = new URL(value);
        return !["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname);
      } catch {
        return false;
      }
    }) || "https://github.com/linhnguyen-gt/Routiform";
  const title = process.env.OPENROUTER_APP_TITLE || process.env.APP_NAME || "routiform";

  return {
    "HTTP-Referer": referer,
    "X-OpenRouter-Title": title,
    "X-Title": title,
  };
}

export class DefaultExecutor extends BaseExecutor {
  constructor(provider) {
    super(provider, PROVIDERS[provider] || PROVIDERS.openai);
  }

  buildUrl(model, stream, urlIndex = 0, credentials = null) {
    void model;
    void stream;
    void urlIndex;
    if (this.provider?.startsWith?.("openai-compatible-")) {
      const psd = credentials?.providerSpecificData;
      const baseUrl = psd?.baseUrl || "https://api.openai.com/v1";
      const normalized = baseUrl.replace(/\/$/, "");
      const customPath = typeof psd?.chatPath === "string" && psd.chatPath ? psd.chatPath : null;
      if (customPath) return `${normalized}${customPath}`;
      const path = this.provider.includes("responses") ? "/responses" : "/chat/completions";
      return `${normalized}${path}`;
    }
    if (this.provider?.startsWith?.("anthropic-compatible-")) {
      const psd = credentials?.providerSpecificData;
      const baseUrl = psd?.baseUrl || "https://api.anthropic.com/v1";
      const customPath = typeof psd?.chatPath === "string" && psd.chatPath ? psd.chatPath : null;
      if (isClaudeCodeCompatible(this.provider)) {
        return joinClaudeCodeCompatibleUrl(
          baseUrl,
          customPath || CLAUDE_CODE_COMPATIBLE_DEFAULT_CHAT_PATH
        );
      }
      const normalized = baseUrl.replace(/\/$/, "");
      return `${normalized}${customPath || "/messages"}`;
    }
    switch (this.provider) {
      case "claude":
      case "glm":
      case "kimi-coding":
      case "minimax":
      case "minimax-cn":
        return `${this.config.baseUrl}?beta=true`;
      case "gemini":
        return `${this.config.baseUrl}/${model}:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`;
      default:
        return this.config.baseUrl;
    }
  }

  buildHeaders(credentials, stream = true) {
    const headers = { "Content-Type": "application/json", ...this.config.headers };

    // T07: resolve extra keys round-robin locally since DefaultExecutor overrides BaseExecutor buildHeaders
    const extraKeys =
      (credentials.providerSpecificData?.extraApiKeys as string[] | undefined) ?? [];
    const effectiveKey =
      extraKeys.length > 0 && credentials.connectionId && credentials.apiKey
        ? getRotatingApiKey(credentials.connectionId, credentials.apiKey, extraKeys)
        : credentials.apiKey;

    switch (this.provider) {
      case "gemini":
        effectiveKey
          ? (headers["x-goog-api-key"] = effectiveKey)
          : (headers["Authorization"] = `Bearer ${credentials.accessToken}`);
        break;
      case "claude":
        effectiveKey
          ? (headers["x-api-key"] = effectiveKey)
          : (headers["Authorization"] = `Bearer ${credentials.accessToken}`);
        break;
      case "glm":
      case "kimi-coding":
      case "bailian-coding-plan":
      case "kimi-coding-apikey":
      case "minimax":
      case "minimax-cn":
        headers["x-api-key"] = effectiveKey || credentials.accessToken;
        break;
      case "cline": {
        const token = effectiveKey || credentials.accessToken || "";
        return buildClineHeaders(token, stream);
      }
      default:
        if (isClaudeCodeCompatible(this.provider)) {
          return buildClaudeCodeCompatibleHeaders(
            effectiveKey || credentials.accessToken || "",
            stream,
            credentials?.providerSpecificData?.ccSessionId
          );
        }
        if (this.provider?.startsWith?.("anthropic-compatible-")) {
          if (effectiveKey) {
            headers["x-api-key"] = effectiveKey;
          } else if (credentials.accessToken) {
            headers["Authorization"] = `Bearer ${credentials.accessToken}`;
          }
          if (!headers["anthropic-version"]) {
            headers["anthropic-version"] = "2023-06-01";
          }
        } else {
          headers["Authorization"] = `Bearer ${effectiveKey || credentials.accessToken}`;
        }
    }

    if (this.provider === "openrouter") {
      Object.assign(headers, getOpenRouterAttributionHeaders());
    }

    if (stream) headers["Accept"] = "text/event-stream";

    return headers;
  }

  /**
   * For compatible providers, the model name is already clean by the time
   * it reaches the executor (chatCore sets body.model = modelInfo.model,
   * which is the parsed model ID without internal routing prefixes).
   *
   * Models may legitimately contain "/" as part of their ID (e.g. "zai-org/GLM-5-FP8",
   * "org/model-name") — we must NOT strip path segments. (Fix #493)
   */
  transformRequest(model, body, _stream, _credentials) {
    return body;
  }

  /**
   * Refresh credentials via the centralized tokenRefresh service.
   * Delegates to getAccessToken() which handles all providers with
   * race-condition protection (deduplication via refreshPromiseCache).
   */
  async refreshCredentials(credentials, log) {
    if (!credentials.refreshToken) return null;
    try {
      return await getAccessToken(this.provider, credentials, log);
    } catch (error) {
      log?.error?.("TOKEN", `${this.provider} refresh error: ${error.message}`);
      return null;
    }
  }
}

export default DefaultExecutor;
