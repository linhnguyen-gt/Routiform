/**
 * The GitHub Copilot model catalog — single source of truth.
 *
 * Both the routing registry (`OAUTH_PROVIDERS.github.models`) and the dashboard's
 * `/api/providers/:id/models` response derive from this table, so the two cannot drift
 * apart. `tests/unit/github-copilot-model-catalog.test.mjs` enforces that.
 *
 * ## Where the entries come from
 *
 * `GET https://api.githubcopilot.com/models`, authenticated with a Copilot token. The
 * public docs page (`/copilot/reference/ai-models/supported-models`) lists display names
 * only, never model IDs, so it cannot be the source: it tells you Claude Opus 4.8 exists
 * but not that you must send `claude-opus-4.8`.
 *
 * ## Which of the upstream models ship here
 *
 * The endpoint returns everything the account can reach — 53 entries at the last refresh,
 * most of which are not models a user picks. Two mechanical filters cut it to this table:
 *
 * 1. `capabilities.type === "chat"` — drops embeddings (`text-embedding-*`) and the
 *    completion-only `gpt-41-copilot`.
 * 2. `model_picker_category` is set — drops Copilot's internal orchestration models
 *    (`copilot-search-*`, `exec-agent-*`, `trajectory-compaction`) and the retired
 *    snapshots upstream still answers on (`gpt-4o-2024-08-06`, `gpt-4-0613`,
 *    `gpt-3.5-turbo`, …). The category is also the tier below.
 *
 * Plus one by hand: `mai-code-1-flash` ships once. Upstream also advertises `-picker`,
 * `-secondary`, `-tertiary` and `-4th` shards of it under the same display name; they are
 * load-balancing targets, not distinct models.
 *
 * An ID missing from this table is still routable — nothing validates a request against
 * it. The table is the advertised catalog, not an allowlist.
 *
 * ## Refreshing
 *
 * Re-run the endpoint and re-apply the two filters. Do not hand-add a model from the docs
 * page: an ID that is guessed rather than observed is how `claude-opus-4-5-20251101`,
 * `gpt-5.2-codex` and `goldeneye` ended up in the catalog, all three unrecognised upstream.
 *
 * Note that `/models` is narrower than what the backend will physically route: an
 * unrecognised ID comes back listing a longer set that includes unadvertised and retired
 * entries. Advertising only what `/models` returns is deliberate. Separately, whether a
 * listed model actually answers depends on the account's Copilot SKU and per-model policy
 * — a `free_educational_quota` account gets 400 `model_not_supported` on most of this
 * table. That is entitlement, not a stale catalog.
 */

export type GithubCopilotModelTier = "lightweight" | "versatile" | "powerful";

export interface GithubCopilotModel {
  /** The ID to send upstream, verbatim as `/models` reports it. */
  id: string;
  /** Display name, as GitHub shows it in the Copilot model picker. */
  name: string;
  /** Upstream `vendor`, lowercased and hyphenated. */
  vendor: string;
  /** Upstream `model_picker_category` — GitHub's own speed/capability grouping. */
  tier: GithubCopilotModelTier;
  /** Upstream `preview` — GA models omit it. */
  preview?: boolean;
  /** Upstream `capabilities.supports.adaptive_thinking`. */
  thinking?: boolean;
  /** Upstream `capabilities.limits.max_context_window_tokens`. */
  contextLength?: number;
  /** Upstream `capabilities.limits.max_output_tokens`. */
  maxOutputTokens?: number;
  /**
   * Set only where upstream serves `/responses` and NOT `/chat/completions`. Sending such
   * a model to chat/completions comes back 400 `unsupported_api_for_model`; the reverse
   * holds for the Anthropic entries, which is why none of them carry this.
   */
  targetFormat?: "openai-responses";
}

export const GITHUB_COPILOT_MODELS: readonly GithubCopilotModel[] = [
  // Anthropic — /v1/messages + /chat/completions. Never /responses.
  {
    id: "claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    vendor: "anthropic",
    tier: "lightweight",
    contextLength: 200000,
    maxOutputTokens: 32000,
  },
  {
    id: "claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    vendor: "anthropic",
    tier: "versatile",
    contextLength: 200000,
    maxOutputTokens: 32000,
  },
  {
    id: "claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    vendor: "anthropic",
    tier: "versatile",
    thinking: true,
    contextLength: 264000,
    maxOutputTokens: 64000,
  },
  {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    vendor: "anthropic",
    tier: "versatile",
    thinking: true,
    contextLength: 264000,
    maxOutputTokens: 64000,
  },
  {
    id: "claude-opus-4.5",
    name: "Claude Opus 4.5",
    vendor: "anthropic",
    tier: "powerful",
    contextLength: 200000,
    maxOutputTokens: 32000,
  },
  {
    id: "claude-opus-4.7",
    name: "Claude Opus 4.7",
    vendor: "anthropic",
    tier: "powerful",
    thinking: true,
    contextLength: 264000,
    maxOutputTokens: 64000,
  },
  {
    id: "claude-opus-4.8",
    name: "Claude Opus 4.8",
    vendor: "anthropic",
    tier: "powerful",
    thinking: true,
    contextLength: 264000,
    maxOutputTokens: 64000,
  },
  {
    id: "claude-opus-4.8-fast",
    name: "Claude Opus 4.8 (fast mode)",
    vendor: "anthropic",
    tier: "powerful",
    preview: true,
    thinking: true,
    contextLength: 264000,
    maxOutputTokens: 64000,
  },
  {
    id: "claude-opus-5",
    name: "Claude Opus 5",
    vendor: "anthropic",
    tier: "powerful",
    thinking: true,
    contextLength: 264000,
    maxOutputTokens: 64000,
  },
  {
    id: "claude-fable-5",
    name: "Claude Fable 5",
    vendor: "anthropic",
    tier: "powerful",
    thinking: true,
    contextLength: 264000,
    maxOutputTokens: 64000,
  },

  // OpenAI — the GPT-5.x family is /responses-only apart from 5.4, which serves both.
  {
    id: "gpt-5.3-codex",
    name: "GPT-5.3-Codex",
    vendor: "openai",
    tier: "powerful",
    contextLength: 400000,
    maxOutputTokens: 128000,
    targetFormat: "openai-responses",
  },
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    vendor: "openai",
    tier: "powerful",
    contextLength: 400000,
    maxOutputTokens: 128000,
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 mini",
    vendor: "openai",
    tier: "lightweight",
    contextLength: 400000,
    maxOutputTokens: 128000,
    targetFormat: "openai-responses",
  },
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    vendor: "openai",
    tier: "powerful",
    contextLength: 400000,
    maxOutputTokens: 128000,
    targetFormat: "openai-responses",
  },
  {
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    vendor: "openai",
    tier: "lightweight",
    contextLength: 328000,
    maxOutputTokens: 128000,
    targetFormat: "openai-responses",
  },
  {
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    vendor: "openai",
    tier: "powerful",
    contextLength: 400000,
    maxOutputTokens: 128000,
    targetFormat: "openai-responses",
  },
  {
    id: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    vendor: "openai",
    tier: "versatile",
    contextLength: 400000,
    maxOutputTokens: 128000,
    targetFormat: "openai-responses",
  },

  // Azure OpenAI — `oswe-vscode-prime` is the ID behind the "Raptor mini" display name.
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    vendor: "azure-openai",
    tier: "versatile",
    contextLength: 128000,
    maxOutputTokens: 16384,
  },
  {
    id: "gpt-5-mini",
    name: "GPT-5 mini",
    vendor: "azure-openai",
    tier: "lightweight",
    contextLength: 264000,
    maxOutputTokens: 64000,
  },
  {
    id: "oswe-vscode-prime",
    name: "Raptor mini",
    vendor: "azure-openai",
    tier: "versatile",
    contextLength: 264000,
    maxOutputTokens: 64000,
  },

  // Google
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro",
    vendor: "google",
    tier: "powerful",
    preview: true,
    contextLength: 264000,
    maxOutputTokens: 64000,
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    vendor: "google",
    tier: "lightweight",
    contextLength: 264000,
    maxOutputTokens: 64000,
  },
  {
    id: "gemini-3.6-flash",
    name: "Gemini 3.6 Flash",
    vendor: "google",
    tier: "versatile",
    contextLength: 264000,
    maxOutputTokens: 64000,
  },

  // Others
  {
    id: "kimi-k2.7-code",
    name: "Kimi K2.7 Code",
    vendor: "moonshot-ai",
    tier: "lightweight",
    contextLength: 256000,
    maxOutputTokens: 32000,
  },
  {
    id: "mai-code-1-flash",
    name: "MAI-Code-1-Flash",
    vendor: "microsoft",
    tier: "lightweight",
    contextLength: 256000,
    maxOutputTokens: 128000,
    targetFormat: "openai-responses",
  },
];

/**
 * Registry view — matches `RegistryModel` structurally. Typed here rather than imported
 * so `src/shared` stays free of an `open-sse` dependency (the arrow points the other way).
 */
export function githubCopilotRegistryModels(): Array<{
  id: string;
  name: string;
  thinking?: boolean;
  targetFormat?: string;
  contextLength?: number;
  maxOutputTokens?: number;
}> {
  return GITHUB_COPILOT_MODELS.map((m) => ({
    id: m.id,
    name: m.preview ? `${m.name} (preview)` : m.name,
    ...(m.thinking ? { thinking: true } : {}),
    ...(m.targetFormat ? { targetFormat: m.targetFormat } : {}),
    ...(m.contextLength ? { contextLength: m.contextLength } : {}),
    ...(m.maxOutputTokens ? { maxOutputTokens: m.maxOutputTokens } : {}),
  }));
}

/** Dashboard view — the shape `/api/providers/:id/models` returns for a local catalog. */
export function githubCopilotCatalogModels(): Array<{
  id: string;
  name: string;
  owned_by: string;
  supportsThinking?: boolean;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  targetFormat?: string;
}> {
  return GITHUB_COPILOT_MODELS.map((m) => ({
    id: m.id,
    name: m.preview ? `${m.name} (preview)` : m.name,
    owned_by: m.vendor,
    ...(m.thinking ? { supportsThinking: true } : {}),
    ...(m.contextLength ? { inputTokenLimit: m.contextLength } : {}),
    ...(m.maxOutputTokens ? { outputTokenLimit: m.maxOutputTokens } : {}),
    ...(m.targetFormat ? { targetFormat: m.targetFormat } : {}),
  }));
}
