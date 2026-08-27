/**
 * Cookie-authenticated web-session providers, gated behind feature flags.
 */

import { isProviderEnabledByFlag } from "../registry-internal.ts";
import type { RegistryEntry } from "../registry-types.ts";

export const WEB_PROVIDERS: Record<string, RegistryEntry> = {
  ...(isProviderEnabledByFlag("ENABLE_PERPLEXITY_WEB_PROVIDER")
    ? {
        "perplexity-web": {
          id: "perplexity-web",
          alias: "pplx-web",
          format: "openai",
          executor: "perplexity-web",
          baseUrl: "https://www.perplexity.ai/rest/sse/perplexity_ask",
          authType: "apikey",
          authHeader: "cookie",
          models: [
            { id: "pplx-auto", name: "Perplexity Auto (Free)" },
            { id: "pplx-sonar", name: "Perplexity Sonar" },
            { id: "pplx-gpt", name: "GPT-5.4 (via Perplexity)" },
            { id: "pplx-gemini", name: "Gemini 3.1 Pro (via Perplexity)" },
            { id: "pplx-sonnet", name: "Claude Sonnet 4.6 (via Perplexity)" },
            { id: "pplx-opus", name: "Claude Opus 4.6 (via Perplexity)" },
            { id: "pplx-nemotron", name: "Nemotron 3 Super (via Perplexity)" },
          ],
        },
      }
    : {}),

  ...(isProviderEnabledByFlag("ENABLE_GROK_WEB_PROVIDER")
    ? {
        "grok-web": {
          id: "grok-web",
          alias: "grok-web",
          format: "openai",
          executor: "grok-web",
          baseUrl: "https://grok.com/api/chat/completions",
          authType: "apikey",
          authHeader: "cookie",
          models: [
            { id: "grok-web-auto", name: "Grok Web Auto", toolCalling: true },
            { id: "grok-4", name: "Grok 4 (Web)", toolCalling: true },
            { id: "grok-code-fast-1", name: "Grok Code Fast 1 (Web)", toolCalling: true },
          ],
        },
      }
    : {}),
};
