/**
 * OAuth provider registry entries.
 */

import { CONTEXT_CONFIG } from "../../src/shared/constants/context";
import { githubCopilotRegistryModels } from "../../src/shared/constants/github-copilot-models";
import { antigravityUserAgent } from "../services/antigravityHeaders.ts";
import { ANTIGRAVITY_BASE_URLS } from "./antigravityUpstream.ts";
import { getCodexDefaultHeaders } from "./codexClient.ts";
import { mapStainlessArch, mapStainlessOs } from "./registry-internal.ts";
import type { RegistryEntry, RegistryModel } from "./registry-types.ts";

/**
 * Per-model routing tuning for GitHub Copilot that the upstream `/models` payload does not
 * describe, merged over the shared catalog. Keep this to genuine request-shaping choices —
 * anything upstream reports (limits, endpoint support, thinking) belongs in the catalog.
 */
const GITHUB_REQUEST_DEFAULTS: Record<string, Partial<RegistryModel>> = {
  "gpt-5.3-codex": { defaultParams: { reasoning: { effort: "high" } } },
};

export const OAUTH_PROVIDERS: Record<string, RegistryEntry> = {
  claude: {
    id: "claude",
    alias: "cc",
    format: "claude",
    executor: "default",
    baseUrl: "https://api.anthropic.com/v1/messages",
    urlSuffix: "?beta=true",
    authType: "oauth",
    authHeader: "x-api-key",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    headers: {
      "Anthropic-Version": "2023-06-01",
      "Anthropic-Beta":
        "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14,context-management-2025-06-27,prompt-caching-scope-2026-01-05",
      "Anthropic-Dangerous-Direct-Browser-Access": "true",
      "User-Agent": "claude-cli/2.1.63 (external, cli)",
      "X-App": "cli",
      "X-Stainless-Helper-Method": "stream",
      "X-Stainless-Retry-Count": "0",
      "X-Stainless-Runtime-Version": "v24.3.0",
      "X-Stainless-Package-Version": "0.74.0",
      "X-Stainless-Runtime": "node",
      "X-Stainless-Lang": "js",
      "X-Stainless-Arch": mapStainlessArch(),
      "X-Stainless-Os": mapStainlessOs(),
      "X-Stainless-Timeout": "600",
    },
    oauth: {
      clientIdEnv: "CLAUDE_OAUTH_CLIENT_ID",
      clientIdDefault: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
      tokenUrl: "https://console.anthropic.com/v1/oauth/token",
    },
    // Claude Code models are fetched from Anthropic /v1/models for active connections.
    // Do not pin a static catalog here; it drifts quickly and breaks "latest" expectations.
    models: [],
  },

  gemini: {
    id: "gemini",
    alias: "gemini",
    format: "gemini",
    executor: "default",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    urlBuilder: (base, model, stream) => {
      const action = stream ? "streamGenerateContent?alt=sse" : "generateContent";
      return `${base}/${model}:${action}`;
    },
    authType: "apikey",
    authHeader: "x-goog-api-key",
    defaultContextLength: 1000000,
    models: [],
    // Models are populated from Google's API via sync-models (per API key).
    // No hardcoded fallback — show nothing until a key is added.
  },

  codex: {
    id: "codex",
    alias: "cx",
    format: "openai-responses",
    executor: "codex",
    baseUrl: "https://chatgpt.com/backend-api/codex/responses",
    authType: "oauth",
    authHeader: "bearer",
    defaultContextLength: 400000,
    defaultMaxOutputTokens: 128000,
    headers: getCodexDefaultHeaders(),
    oauth: {
      clientIdEnv: "CODEX_OAUTH_CLIENT_ID",
      clientIdDefault: "app_EMoamEEZ73f0CkXaXp7hrann",
      clientSecretEnv: "CODEX_OAUTH_CLIENT_SECRET",
      clientSecretDefault: "",
      tokenUrl: "https://auth.openai.com/oauth/token",
    },
    // Current lineup (Codex CLI model picker, 2026-07-12) leads the list —
    // gpt-5.6-terra is the CLI default. Legacy ids stay listed below so they
    // remain routable via `codex -m <model_name>`; the live models API call
    // (handle-codex-models.ts / codex-models.ts mergeCodexModels) still wins
    // over this static list for connected accounts.
    models: [
      { id: "gpt-5.6-terra", name: "gpt-5.6-terra" },
      { id: "gpt-5.6-luna", name: "gpt-5.6-luna" },
      { id: "gpt-5.5", name: "gpt-5.5" },
      { id: "gpt-5.4-mini", name: "gpt-5.4-mini" },
      { id: "gpt-5.6-sol", name: "gpt-5.6-sol" },
      { id: "gpt-5.4", name: "gpt-5.4" },
      { id: "gpt-5.3-codex", name: "gpt-5.3-codex" },
      { id: "gpt-5.3-codex-spark", name: "gpt-5.3-codex-spark" },
      { id: "gpt-5.2", name: "gpt-5.2" },
    ],
  },

  qoder: {
    id: "qoder",
    alias: "qd",
    format: "openai",
    executor: "qoder",
    // Executor builds the real signed URL itself; baseUrl kept for
    // introspection helpers but ignored by the executor path.
    baseUrl: "https://api3.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation",
    authType: "oauth",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    headers: {},
    oauth: {
      // Device-token flow lives entirely in src/lib/oauth/services/qoder.ts;
      // no client_id/client_secret needed.
      tokenUrl: "https://openapi.qoder.sh/api/v1/deviceToken/poll",
      authUrl: "https://qoder.com/device/selectAccounts",
    },
    models: [
      // Minimal fallback — live catalog (handle-qoder-models.ts) overrides
      // this list per account. Hard-coding the full server catalog would
      // require manual sync each time Qoder publishes new keys.
      { id: "auto", name: "Auto — Smart Routing" },
      { id: "ultimate", name: "Ultimate — Expert Reasoning" },
    ],
  },

  antigravity: {
    id: "antigravity",
    alias: undefined,
    format: "antigravity",
    executor: "antigravity",
    baseUrls: [...ANTIGRAVITY_BASE_URLS],
    urlBuilder: (base, model, stream) => {
      const path = stream
        ? "/v1internal:streamGenerateContent?alt=sse"
        : "/v1internal:generateContent";
      return `${base}${path}`;
    },
    authType: "oauth",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    headers: {
      "User-Agent": antigravityUserAgent(),
    },
    oauth: {
      clientIdEnv: "ANTIGRAVITY_OAUTH_CLIENT_ID",
      clientIdDefault: "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
      clientSecretEnv: "ANTIGRAVITY_OAUTH_CLIENT_SECRET",
      clientSecretDefault: "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",
    },
    models: [
      // Empty by design. The canonical Antigravity model list is fetched live
      // from the upstream `v1internal:fetchAvailableModels` endpoint via
      // `loadAntigravityModelsForConnection` (see
      // `src/lib/providers/antigravityLiveModels.ts`). Hardcoding entries here
      // tends to drift from upstream and historically caused tier mislabels
      // (e.g. an "agent" ID labeled "High" while internally remapped to a low
      // tier — surfaced via dashboard test/Health probes hitting exhausted
      // quotas while production traffic worked). `passthroughModels: true` is
      // the operative flag — model IDs flow through unmodified.
    ],
    passthroughModels: true,
  },

  github: {
    id: "github",
    alias: "gh",
    format: "openai",
    executor: "github",
    baseUrl: "https://api.githubcopilot.com/chat/completions",
    responsesBaseUrl: "https://api.githubcopilot.com/responses",
    authType: "oauth",
    authHeader: "bearer",
    defaultContextLength: 128000,
    headers: {
      "copilot-integration-id": "vscode-chat",
      "editor-version": "vscode/1.110.0",
      "editor-plugin-version": "copilot-chat/0.38.0",
      "user-agent": "GitHubCopilotChat/0.38.0",
      "openai-intent": "conversation-panel",
      "x-github-api-version": "2025-04-01",
      "x-vscode-user-agent-library-version": "electron-fetch",
      "X-Initiator": "user",
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    // Derived from the shared catalog so this list and the dashboard's
    // /api/providers/:id/models response cannot drift. Entries come from
    // GET api.githubcopilot.com/models — the docs page publishes display names only.
    // GITHUB_REQUEST_DEFAULTS carries the routing-side tuning upstream does not describe.
    models: githubCopilotRegistryModels().map((m) => ({
      ...m,
      ...(GITHUB_REQUEST_DEFAULTS[m.id] ?? {}),
    })),
  },

  kiro: {
    id: "kiro",
    alias: "kr",
    format: "kiro",
    executor: "kiro",
    baseUrl: "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse",
    authType: "oauth",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/vnd.amazon.eventstream",
      "X-Amz-Target": "AmazonCodeWhispererStreamingService.GenerateAssistantResponse",
      "User-Agent": "AWS-SDK-JS/3.0.0 kiro-ide/1.0.0",
      "X-Amz-User-Agent": "aws-sdk-js/3.0.0 kiro-ide/1.0.0",
    },
    oauth: {
      tokenUrl: "https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken",
      authUrl: "https://prod.us-east-1.auth.desktop.kiro.dev",
    },
    models: [
      { id: "auto", name: "Auto (1.00x credits)" },
      // Credit multipliers estimated from the sibling model in the same tier (Opus/Sonnet)
      // until kiro.dev publishes official pricing for these ids.
      { id: "claude-opus-4.8", name: "Claude Opus 4.8 (2.20x credits)", maxOutputTokens: 32000 },
      {
        id: "claude-opus-4.7",
        name: "Claude Opus 4.7 (2.20x credits) — Experimental preview",
        maxOutputTokens: 32000,
      },
      { id: "claude-opus-4.6", name: "Claude Opus 4.6 (2.20x credits)", maxOutputTokens: 32000 },
      { id: "claude-sonnet-5", name: "Claude Sonnet 5 (1.30x credits)", maxOutputTokens: 64000 },
      {
        id: "claude-sonnet-4.6",
        name: "Claude Sonnet 4.6 (1.30x credits) — Latest Sonnet model",
        maxOutputTokens: 64000,
      },
      { id: "claude-opus-4.5", name: "Claude Opus 4.5 (2.20x credits)", maxOutputTokens: 32000 },
      {
        id: "claude-sonnet-4.5",
        name: "Claude Sonnet 4.5 (1.30x credits)",
        maxOutputTokens: 64000,
      },
      { id: "claude-sonnet-4", name: "Claude Sonnet 4 (1.30x credits)", maxOutputTokens: 64000 },
      { id: "claude-haiku-4.5", name: "Claude Haiku 4.5 (0.40x credits)", maxOutputTokens: 8192 },
      { id: "deepseek-3.2", name: "DeepSeek 3.2 (0.25x credits)" },
      { id: "minimax-m2.5", name: "MiniMax M2.5 (0.25x credits)" },
      { id: "minimax-m2.1", name: "MiniMax M2.1 (0.15x credits)" },
      { id: "glm-5", name: "GLM-5 (0.50x credits)" },
      { id: "qwen3-coder-next", name: "Qwen3 Coder Next (0.05x credits)" },
    ],
  },

  devin: {
    id: "devin",
    alias: "dv",
    format: "devin",
    executor: "devin",
    // DevinExecutor spawns `devin --print` subprocess — no HTTP endpoint needed.
    baseUrl: "devin://subprocess",
    authType: "oauth",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    headers: {},
    oauth: {},
    models: [],
    passthroughModels: true,
  },

  cursor: {
    id: "cursor",
    alias: "cu",
    format: "cursor",
    executor: "cursor",
    baseUrl: "https://api2.cursor.sh",
    chatPath: "/aiserver.v1.ChatService/StreamUnifiedChatWithTools",
    authType: "oauth",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    headers: {
      "connect-accept-encoding": "gzip",
      "connect-protocol-version": "1",
      "Content-Type": "application/connect+proto",
      "User-Agent": "connect-es/1.6.1",
    },
    clientVersion: "1.1.3",
    models: [
      { id: "default", name: "Auto (Server Picks)" },
      { id: "claude-4.6-opus-high-thinking", name: "Claude 4.6 Opus High Thinking" },
      { id: "claude-4.6-opus-high", name: "Claude 4.6 Opus High" },
      { id: "claude-4.6-sonnet-high-thinking", name: "Claude 4.6 Sonnet High Thinking" },
      { id: "claude-4.6-sonnet-high", name: "Claude 4.6 Sonnet High" },
      { id: "claude-4.6-haiku", name: "Claude 4.6 Haiku" },
      { id: "claude-4.6-opus", name: "Claude 4.6 Opus" },
      { id: "claude-4.5-opus-high-thinking", name: "Claude 4.5 Opus High Thinking" },
      { id: "claude-4.5-opus-high", name: "Claude 4.5 Opus High" },
      { id: "claude-4.5-sonnet-thinking", name: "Claude 4.5 Sonnet Thinking" },
      { id: "claude-4.5-sonnet", name: "Claude 4.5 Sonnet" },
      { id: "claude-4.5-haiku", name: "Claude 4.5 Haiku" },
      { id: "claude-4.5-opus", name: "Claude 4.5 Opus" },
      { id: "gpt-5.2-codex", name: "GPT 5.2 Codex" },
    ],
  },
};
