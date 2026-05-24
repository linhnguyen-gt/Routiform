/**
 * OAuth provider registry entries.
 */

import { CONTEXT_CONFIG } from "../../src/shared/constants/context";
import { antigravityUserAgent } from "../services/antigravityHeaders.ts";
import { ANTIGRAVITY_BASE_URLS } from "./antigravityUpstream.ts";
import { getCodexDefaultHeaders } from "./codexClient.ts";
import { mapStainlessArch, mapStainlessOs } from "./registry-internal.ts";
import type { RegistryEntry } from "./registry-types.ts";

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
    models: [
      { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
      { id: "claude-sonnet-4-6", name: "Claude 4.6 Sonnet" },
      { id: "claude-opus-4-5-20251101", name: "Claude 4.5 Opus" },
      { id: "claude-sonnet-4-5-20250929", name: "Claude 4.5 Sonnet" },
      { id: "claude-haiku-4-5-20251001", name: "Claude 4.5 Haiku" },
    ],
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
    oauth: {
      clientIdEnv: "GEMINI_OAUTH_CLIENT_ID",
      clientIdDefault: "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com",
      clientSecretEnv: "GEMINI_OAUTH_CLIENT_SECRET",
      clientSecretDefault: "",
    },
    models: [],
    // Models are populated from Google's API via sync-models (per API key).
    // No hardcoded fallback — show nothing until a key is added.
  },

  "gemini-cli": {
    id: "gemini-cli",
    alias: "gemini-cli",
    format: "gemini-cli",
    executor: "gemini-cli",
    baseUrl: "https://daily-cloudcode-pa.googleapis.com/v1internal",
    urlBuilder: (base, model, stream) => {
      const action = stream ? "streamGenerateContent?alt=sse" : "generateContent";
      return `${base}:${action}`;
    },
    authType: "oauth",
    authHeader: "bearer",
    defaultContextLength: 1000000,
    oauth: {
      clientIdEnv: "GEMINI_CLI_OAUTH_CLIENT_ID",
      clientIdDefault: "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com",
      clientSecretEnv: "GEMINI_OAUTH_CLIENT_SECRET",
      clientSecretDefault: "",
    },
    models: [
      { id: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview" },
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview" },
      { id: "gemini-3.1-pro-preview-customtools", name: "Gemini 3.1 Pro Preview Custom Tools" },
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
      { id: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite Preview" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
    ],
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
    models: [
      { id: "gpt-5.4", name: "gpt-5.4" },
      { id: "gpt-5.4-mini", name: "gpt-5.4-mini" },
      { id: "gpt-5.3-codex", name: "gpt-5.3-codex" },
      { id: "gpt-5.2", name: "gpt-5.2" },
    ],
  },

  qwen: {
    id: "qwen",
    alias: "qw",
    format: "openai",
    executor: "default",
    baseUrl: "https://chat.qwen.ai/api/v1/services/aigc/text-generation/generation",
    authType: "oauth",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    headers: {
      "User-Agent": "QwenCode/0.12.3 (linux; x64)",
      "X-Dashscope-AuthType": "qwen-oauth",
      "X-Dashscope-CacheControl": "enable",
      "X-Dashscope-UserAgent": "QwenCode/0.12.3 (linux; x64)",
      "X-Stainless-Arch": "x64",
      "X-Stainless-Lang": "js",
      "X-Stainless-Os": "Linux",
      "X-Stainless-Package-Version": "5.11.0",
      "X-Stainless-Retry-Count": "1",
      "X-Stainless-Runtime": "node",
      "X-Stainless-Runtime-Version": "v18.19.1",
      Connection: "keep-alive",
      "Accept-Language": "*",
      "Sec-Fetch-Mode": "cors",
    },
    oauth: {
      clientIdEnv: "QWEN_OAUTH_CLIENT_ID",
      clientIdDefault: "f0304373b74a44d2b584a3fb70ca9e56",
      tokenUrl: "https://chat.qwen.ai/api/v1/oauth2/token",
      authUrl: "https://chat.qwen.ai/api/v1/oauth2/device/code",
    },
    models: [
      { id: "qwen3-coder-plus", name: "Qwen3 Coder Plus" },
      { id: "qwen3-coder-flash", name: "Qwen3 Coder Flash" },
      { id: "vision-model", name: "Qwen3 Vision Model" },
      { id: "coder-model", name: "Coder Model" },
    ],
  },

  qoder: {
    id: "qoder",
    alias: "if",
    format: "openai",
    executor: "qoder",
    baseUrl: "https://api.qoder.com/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    headers: {
      "User-Agent": "Qoder-Cli",
    },
    oauth: {
      clientIdEnv: "QODER_OAUTH_CLIENT_ID",
      clientSecretEnv: "QODER_OAUTH_CLIENT_SECRET",
      tokenUrl: process.env.QODER_OAUTH_TOKEN_URL || "",
      authUrl: process.env.QODER_OAUTH_AUTHORIZE_URL || "",
    },
    models: [
      { id: "qwen-coder-qoder-1.0", name: "Qwen-Coder-Qoder-1.0" },
      { id: "qwen3.5-plus", name: "Qwen3.5-Plus" },
      { id: "glm-5", name: "GLM-5" },
      { id: "kimi-k2.5", name: "Kimi-K2.5", forceParams: { temperature: 1 } },
      { id: "minimax-m2.5", name: "MiniMax-M2.5" },
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
      { id: "gemini-3-flash-agent", name: "Gemini 3.5 Flash (High)" },
      { id: "gemini-3.5-flash-low", name: "Gemini 3.5 Flash (Medium)" },
      { id: "gemini-pro-agent", name: "Gemini 3.1 Pro (High)" },
      { id: "gemini-3.1-pro-low", name: "Gemini 3.1 Pro (Low)" },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (Thinking)" },
      { id: "claude-opus-4-6-thinking", name: "Claude Opus 4.6 (Thinking)" },
      { id: "gpt-oss-120b-medium", name: "GPT-OSS 120B (Medium)" },
      { id: "gemini-3-flash", name: "Gemini 3 Flash", thinking: false },
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
    // Only models listed under "Supported AI models in Copilot" (excl. GPT-5.1 — closing down 2026-04-15):
    // https://docs.github.com/en/copilot/reference/ai-models/supported-models#supported-ai-models-in-copilot
    models: [
      { id: "gpt-4.1", name: "GPT-4.1" },
      { id: "gpt-5-mini", name: "GPT-5 mini" },
      { id: "gpt-5.2", name: "GPT-5.2" },
      { id: "gpt-5.2-codex", name: "GPT-5.2-Codex", targetFormat: "openai-responses" },
      {
        id: "gpt-5.3-codex",
        name: "GPT-5.3-Codex",
        targetFormat: "openai-responses",
        defaultParams: { reasoning: { effort: "high" } },
      },
      { id: "gpt-5.4", name: "GPT-5.4" },
      { id: "gpt-5.4-mini", name: "GPT-5.4 mini", targetFormat: "openai-responses" },
      // Must stay on /chat/completions — Copilot returns 400 unsupported_api_for_model on /responses.
      { id: "claude-haiku-4.5", name: "Claude Haiku 4.5" },
      { id: "claude-opus-4-5-20251101", name: "Claude Opus 4.5" },
      { id: "claude-opus-4.6", name: "Claude Opus 4.6" },
      { id: "claude-opus-4.6-fast", name: "Claude Opus 4.6 (fast mode) (preview)" },
      { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
      { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
      { id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash" },
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro" },
      { id: "grok-code-fast-1", name: "Grok Code Fast 1" },
      { id: "oswe-vscode-prime", name: "Raptor mini" },
      { id: "goldeneye", name: "Goldeneye" },
    ],
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
      {
        id: "claude-opus-4.7",
        name: "Claude Opus 4.7 (2.20x credits) — Experimental preview",
        maxOutputTokens: 32000,
      },
      { id: "claude-opus-4.6", name: "Claude Opus 4.6 (2.20x credits)", maxOutputTokens: 32000 },
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
