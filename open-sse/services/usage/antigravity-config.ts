import { PROVIDERS } from "../../config/constants.ts";

// Antigravity API config (credentials from PROVIDERS via credential loader)
export const ANTIGRAVITY_CONFIG = {
  quotaApiUrl: "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
  loadProjectApiUrl: "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
  retrieveUserQuotaUrl: "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota",
  tokenUrl: "https://oauth2.googleapis.com/token",
  get clientId() {
    return PROVIDERS.antigravity.clientId;
  },
  get clientSecret() {
    return PROVIDERS.antigravity.clientSecret;
  },
  // Fallback only — PROVIDERS.antigravity.headers normally supplies this from
  // antigravityHeaders.ts. Kept byte-identical to that module's captured CLI
  // string so a fallback never silently downgrades the model catalogue.
  userAgent:
    "antigravity/cli/1.1.13 (aidev_client; os_type=darwin; arch=arm64; cl=964361259; auth_method=consumer)",
};

/** Models excluded from Antigravity quota display (internal / non-chat). Keep in sync with executor routing. */
export const ANTIGRAVITY_EXCLUDED_MODELS = new Set([
  "chat_20706",
  "chat_23310",
  "tab_flash_lite_preview",
  "tab_jump_flash_lite_preview",
  "gemini-2.5-flash-thinking",
  "gemini-2.5-pro", // browser subagent model — not user-callable
  "gemini-2.5-flash", // internal — quota often exhausted on free tier
  "gemini-2.5-flash-lite", // internal — quota often exhausted on free tier
  "gemini-2.5-flash-preview-image-generation", // image-gen only, not usable for chat
  "gemini-3.1-flash-image-preview", // image-gen preview, not usable for chat
  "gemini-3.1-flash-image", // image model — omit from Antigravity quota bars
  "gemini-3-flash-agent", // internal agent model — not user-callable
  "gemini-3.1-flash-lite", // not usable for chat
  "gemini-3-pro-low", // distinct from gemini-3.1-pro-low in registry
  "gemini-3-pro-high",
]);

export function getAntigravityApiUserAgent(): string {
  const h = PROVIDERS.antigravity?.headers as Record<string, string> | undefined;
  const ua = h?.["User-Agent"];
  return typeof ua === "string" && ua.length > 0 ? ua : ANTIGRAVITY_CONFIG.userAgent;
}
