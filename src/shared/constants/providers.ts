import { validateProviders } from "../validation/providerSchema";
import { APIKEY_PROVIDERS } from "./providers/apiKeyProviders";
import { FREE_APIKEY_PROVIDER_IDS, FREE_PROVIDERS } from "./providers/freeProviders";
import { OAUTH_PROVIDERS } from "./providers/oauthProviders";
import type { ProviderDefinition } from "./providers/types";
import { UPSTREAM_PROXY_PROVIDERS } from "./providers/upstreamProxyProviders";

export { APIKEY_PROVIDERS, FREE_APIKEY_PROVIDER_IDS, FREE_PROVIDERS, OAUTH_PROVIDERS };

export const OPENAI_COMPATIBLE_PREFIX = "openai-compatible-";
export const ANTHROPIC_COMPATIBLE_PREFIX = "anthropic-compatible-";
export const CLAUDE_CODE_COMPATIBLE_PREFIX = "anthropic-compatible-cc-";

export function supportsApiKeyOnFreeProvider(providerId: string) {
  return FREE_APIKEY_PROVIDER_IDS.has(providerId);
}

export function isOpenAICompatibleProvider(providerId: unknown) {
  return typeof providerId === "string" && providerId.startsWith(OPENAI_COMPATIBLE_PREFIX);
}

export function isAnthropicCompatibleProvider(providerId: unknown) {
  return typeof providerId === "string" && providerId.startsWith(ANTHROPIC_COMPATIBLE_PREFIX);
}

export function isClaudeCodeCompatibleProvider(providerId: unknown) {
  return typeof providerId === "string" && providerId.startsWith(CLAUDE_CODE_COMPATIBLE_PREFIX);
}

export const AI_PROVIDERS = {
  ...FREE_PROVIDERS,
  ...OAUTH_PROVIDERS,
  ...APIKEY_PROVIDERS,
  ...UPSTREAM_PROXY_PROVIDERS,
};

const ALL_PROVIDERS = Object.values(AI_PROVIDERS).filter(Boolean) as ProviderDefinition[];

export const AUTH_METHODS = {
  oauth: { id: "oauth", name: "OAuth", icon: "lock" },
  apikey: { id: "apikey", name: "API Key", icon: "key" },
};

export function getProviderByAlias(alias: unknown): ProviderDefinition | null {
  if (typeof alias !== "string" || alias.length === 0) return null;

  const normalizedAlias = alias.toLowerCase();
  for (const provider of ALL_PROVIDERS) {
    const providerId = provider.id.toLowerCase();
    const providerAlias = provider.alias?.toLowerCase();
    if (providerAlias === normalizedAlias || providerId === normalizedAlias) {
      return provider;
    }
  }

  return null;
}

export function resolveProviderId(aliasOrId: string) {
  const provider = getProviderByAlias(aliasOrId);
  return provider?.id || aliasOrId;
}

export function getProviderAlias(providerId: string) {
  return AI_PROVIDERS[providerId as keyof typeof AI_PROVIDERS]?.alias || providerId;
}

export const ALIAS_TO_ID = ALL_PROVIDERS.reduce<Record<string, string>>((acc, provider) => {
  if (provider.alias) acc[provider.alias] = provider.id;
  return acc;
}, {});

export const ID_TO_ALIAS = ALL_PROVIDERS.reduce<Record<string, string>>((acc, provider) => {
  acc[provider.id] = provider.alias || provider.id;
  return acc;
}, {});

export const USAGE_SUPPORTED_PROVIDERS = [
  "antigravity",
  "gemini-cli",
  "kiro",
  "github",
  "codex",
  "claude",
  "kimi-coding",
  "glm",
];

validateProviders(FREE_PROVIDERS, "FREE_PROVIDERS");
validateProviders(OAUTH_PROVIDERS, "OAUTH_PROVIDERS");
validateProviders(APIKEY_PROVIDERS, "APIKEY_PROVIDERS");
