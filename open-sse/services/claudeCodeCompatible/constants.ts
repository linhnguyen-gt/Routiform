import { getStainlessTimeoutSeconds } from "@/shared/utils/runtimeTimeouts";

export const CLAUDE_CODE_COMPATIBLE_PREFIX = "anthropic-compatible-cc-";
export const CLAUDE_CODE_COMPATIBLE_DEFAULT_CHAT_PATH = "/v1/messages?beta=true";
export const CLAUDE_CODE_COMPATIBLE_DEFAULT_MODELS_PATH = "/models";
export const CLAUDE_CODE_COMPATIBLE_DEFAULT_MAX_TOKENS = 32000;
export const CLAUDE_CODE_COMPATIBLE_ANTHROPIC_VERSION = "2023-06-01";
export const CLAUDE_CODE_COMPATIBLE_ANTHROPIC_BETA =
  "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,context-management-2025-06-27,prompt-caching-scope-2026-01-05,effort-2025-11-24,fast-mode-2025-04-01,redact-thinking-2025-06-20,token-efficient-tools-2025-02-19";

export function isClaudeCodeCompatibleProvider(provider: string | null | undefined): boolean {
  return typeof provider === "string" && provider.startsWith(CLAUDE_CODE_COMPATIBLE_PREFIX);
}

export const CLAUDE_CODE_COMPATIBLE_VERSION = "2.1.87";
export const CLAUDE_CODE_COMPATIBLE_USER_AGENT = `claude-cli/${CLAUDE_CODE_COMPATIBLE_VERSION} (external, cli)`;

/** @deprecated Use buildBillingHeader() for dynamic fingerprint */
export const CLAUDE_CODE_COMPATIBLE_BILLING_HEADER = `x-anthropic-billing-header: cc_version=${CLAUDE_CODE_COMPATIBLE_VERSION}.000; cc_entrypoint=cli; cch=00000;`;

export const CLAUDE_CODE_COMPATIBLE_STAINLESS_TIMEOUT_SECONDS = getStainlessTimeoutSeconds(
  process.env
);
