import {
  isAnthropicCompatibleProvider,
  isClaudeCodeCompatibleProvider,
  isOpenAICompatibleProvider,
} from "@/shared/constants/providers";

const UNSUPPORTED_MODEL_LIST_PROVIDERS = new Set([
  "deepgram",
  "assemblyai",
  "nanobanana",
  "claude",
  "perplexity",
  "bailian-coding-plan",
  "qoder",
  "github",
]);

export function supportsProviderModelAutoSync(providerId: string): boolean {
  if (!providerId || providerId.endsWith("-search")) return false;
  if (isClaudeCodeCompatibleProvider(providerId)) return false;
  // OAuth providers that have a models API endpoint should support auto-sync
  // (e.g. antigravity uses /v1internal:models with accessToken)
  if (isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId)) {
    return true;
  }
  return !UNSUPPORTED_MODEL_LIST_PROVIDERS.has(providerId);
}
