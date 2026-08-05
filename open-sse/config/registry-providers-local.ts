/**
 * Local provider registry entries.
 *
 * Local inference was never actually unsupported: an operator could already create an
 * OpenAI-compatible node with an arbitrary base URL, and `BaseExecutor.execute` calls plain
 * `fetch`, so chat completions against a local Ollama worked. What did not work was everything
 * behind `safeOutboundFetch` — model listing and key validation — which blocks loopback targets
 * unless the caller opts in. The two operator-config call sites now opt in, and this entry turns
 * the arrangement from an accident an operator has to discover into a preset.
 */

import type { RegistryEntry } from "./registry-types.ts";

/** Ollama's default OpenAI-compatible endpoint. Editable per connection; this is only a default. */
const OLLAMA_DEFAULT_BASE = "http://localhost:11434/v1";

export const LOCAL_PROVIDERS: Record<string, RegistryEntry> = {
  "ollama-local": {
    id: "ollama-local",
    alias: "ol",
    format: "openai",
    // No executor file: `getExecutor` constructs a DefaultExecutor for anything not in its map,
    // and this sentinel is how an entry says so without inventing a key.
    executor: "default",
    baseUrl: `${OLLAMA_DEFAULT_BASE}/chat/completions`,
    modelsUrl: `${OLLAMA_DEFAULT_BASE}/models`,
    // Ollama serves without credentials by default. `buildAuthHeaders` sends nothing for "none",
    // and a user who has put an auth proxy in front can still set a key on the connection.
    authType: "none",
    authHeader: "none",
    // Which models exist is whatever the operator has pulled — a shipped list would be wrong for
    // everyone. Passthrough means a failed listing does not block use either.
    passthroughModels: true,
    models: [],
  },
};
