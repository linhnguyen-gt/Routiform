import type { ProviderMap } from "./types";
import { APIKEY_PROVIDERS_LLM_A } from "./apiKeyProvidersLlmA";
import { APIKEY_PROVIDERS_LLM_B } from "./apiKeyProvidersLlmB";
import { APIKEY_PROVIDERS_MEDIA } from "./apiKeyProvidersMedia";
import { APIKEY_PROVIDERS_PLATFORM } from "./apiKeyProvidersPlatform";
import { APIKEY_PROVIDERS_SEARCH_AND_MISC } from "./apiKeyProvidersSearchAndMisc";

export const APIKEY_PROVIDERS = {
  ...APIKEY_PROVIDERS_LLM_A,
  ...APIKEY_PROVIDERS_LLM_B,
  ...APIKEY_PROVIDERS_MEDIA,
  ...APIKEY_PROVIDERS_PLATFORM,
  ...APIKEY_PROVIDERS_SEARCH_AND_MISC,
} satisfies ProviderMap;
