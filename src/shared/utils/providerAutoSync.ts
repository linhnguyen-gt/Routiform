import {
  isAnthropicCompatibleProvider,
  isClaudeCodeCompatibleProvider,
  isOpenAICompatibleProvider,
} from "@/shared/constants/providers";

const UNSUPPORTED_MODEL_LIST_PROVIDERS = new Set([
  "deepgram",
  "assemblyai",
  "nanobanana",
  "antigravity",
  "claude",
  "perplexity",
  "bailian-coding-plan",
  "opencode-go",
  "qoder",
]);

export function supportsProviderModelAutoSync(providerId: string): boolean {
  if (!providerId || providerId.endsWith("-search")) return false;
  if (isClaudeCodeCompatibleProvider(providerId)) return false;
  if (isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId)) {
    return true;
  }
  return !UNSUPPORTED_MODEL_LIST_PROVIDERS.has(providerId);
}
