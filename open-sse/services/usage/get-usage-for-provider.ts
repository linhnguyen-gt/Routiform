import { getAntigravityUsage } from "./antigravity-usage.ts";
import { getClaudeUsage } from "./claude-usage.ts";
import { getCodexUsage } from "./codex-usage.ts";
import { getGeminiUsage } from "./gemini-usage.ts";
import { getGitHubUsage } from "./github-usage.ts";
import { getGlmUsage } from "./glm-usage.ts";
import { getQoderUsage } from "./qwen-qoder-usage.ts";
import { getKimiUsage } from "./kimi-usage.ts";
import { getKiroUsage } from "./kiro-usage.ts";

/**
 * Get usage data for a provider connection
 * @param {Object} connection - Provider connection with accessToken
 * @returns {Promise<unknown>} Usage data with quotas
 */
export async function getUsageForProvider(connection) {
  const { provider, accessToken, apiKey, providerSpecificData, projectId } = connection;

  switch (provider) {
    case "github":
      return await getGitHubUsage(accessToken, providerSpecificData);
    case "gemini-cli":
      return await getGeminiUsage(accessToken, providerSpecificData, projectId);
    case "antigravity":
      return await getAntigravityUsage(accessToken, undefined);
    case "claude":
      return await getClaudeUsage(accessToken);
    case "codex":
      return await getCodexUsage(accessToken, providerSpecificData);
    case "kiro":
      return await getKiroUsage(connection);
    case "kimi-coding":
      return await getKimiUsage(accessToken);
    case "qoder":
      return await getQoderUsage(accessToken);
    case "glm":
      return await getGlmUsage(apiKey, providerSpecificData);
    default:
      return { message: `Usage API not implemented for ${provider}` };
  }
}
