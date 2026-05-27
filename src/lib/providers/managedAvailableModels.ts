import { isClaudeCodeCompatibleProvider } from "@/shared/constants/providers";
import { getClaudeLatestFallbackModels } from "@/shared/services/claudeCodeConfig";

type ManagedAvailableModel = {
  id?: string;
  name?: string;
};

export function getCompatibleFallbackModels(
  _providerId: string,
  fallbackModels: ManagedAvailableModel[] = []
): ManagedAvailableModel[] | undefined {
  if (isClaudeCodeCompatibleProvider(_providerId)) return getClaudeLatestFallbackModels();
  return fallbackModels;
}

export function compatibleProviderSupportsModelImport(providerId: string): boolean {
  return !isClaudeCodeCompatibleProvider(providerId);
}
