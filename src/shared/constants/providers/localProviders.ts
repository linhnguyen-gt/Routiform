import type { ProviderMap } from "./types";

/**
 * Providers that run on the operator's own machine.
 *
 * They reach the outside world only through `safeOutboundFetch`'s loopback opt-in, which is passed
 * on the two operator-config paths (model listing and key validation) and nowhere else.
 */
export const LOCAL_PROVIDERS = {
  "ollama-local": {
    id: "ollama-local",
    alias: "ol",
    name: "Ollama (local)",
    icon: "computer",
    color: "#0F172A",
    textIcon: "OL",
    website: "https://ollama.com",
    // Whatever the operator has pulled — there is no fixed catalog to ship.
    passthroughModels: true,
    defaultPort: 11434,
    apiHint: "Runs on http://localhost:11434 by default. No API key needed.",
  },
} satisfies ProviderMap;
