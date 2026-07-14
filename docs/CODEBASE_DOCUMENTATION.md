# routiform — Codebase Documentation

🌐 **Languages:** 🇺🇸 [English](CODEBASE_DOCUMENTATION.md) | 🇧🇷 [Português (Brasil)](i18n/pt-BR/CODEBASE_DOCUMENTATION.md) | 🇪🇸 [Español](i18n/es/CODEBASE_DOCUMENTATION.md) | 🇫🇷 [Français](i18n/fr/CODEBASE_DOCUMENTATION.md) | 🇮🇹 [Italiano](i18n/it/CODEBASE_DOCUMENTATION.md) | 🇷🇺 [Русский](i18n/ru/CODEBASE_DOCUMENTATION.md) | 🇨🇳 [中文 (简体)](i18n/zh-CN/CODEBASE_DOCUMENTATION.md) | 🇩🇪 [Deutsch](i18n/de/CODEBASE_DOCUMENTATION.md) | 🇮🇳 [हिन्दी](i18n/in/CODEBASE_DOCUMENTATION.md) | 🇹🇭 [ไทย](i18n/th/CODEBASE_DOCUMENTATION.md) | 🇺🇦 [Українська](i18n/uk-UA/CODEBASE_DOCUMENTATION.md) | 🇸🇦 [العربية](i18n/ar/CODEBASE_DOCUMENTATION.md) | 🇯🇵 [日本語](i18n/ja/CODEBASE_DOCUMENTATION.md) | 🇻🇳 [Tiếng Việt](i18n/vi/CODEBASE_DOCUMENTATION.md) | 🇧🇬 [Български](i18n/bg/CODEBASE_DOCUMENTATION.md) | 🇩🇰 [Dansk](i18n/da/CODEBASE_DOCUMENTATION.md) | 🇫🇮 [Suomi](i18n/fi/CODEBASE_DOCUMENTATION.md) | 🇮🇱 [עברית](i18n/he/CODEBASE_DOCUMENTATION.md) | 🇭🇺 [Magyar](i18n/hu/CODEBASE_DOCUMENTATION.md) | 🇮🇩 [Bahasa Indonesia](i18n/id/CODEBASE_DOCUMENTATION.md) | 🇰🇷 [한국어](i18n/ko/CODEBASE_DOCUMENTATION.md) | 🇲🇾 [Bahasa Melayu](i18n/ms/CODEBASE_DOCUMENTATION.md) | 🇳🇱 [Nederlands](i18n/nl/CODEBASE_DOCUMENTATION.md) | 🇳🇴 [Norsk](i18n/no/CODEBASE_DOCUMENTATION.md) | 🇵🇹 [Português (Portugal)](i18n/pt/CODEBASE_DOCUMENTATION.md) | 🇷🇴 [Română](i18n/ro/CODEBASE_DOCUMENTATION.md) | 🇵🇱 [Polski](i18n/pl/CODEBASE_DOCUMENTATION.md) | 🇸🇰 [Slovenčina](i18n/sk/CODEBASE_DOCUMENTATION.md) | 🇸🇪 [Svenska](i18n/sv/CODEBASE_DOCUMENTATION.md) | 🇵🇭 [Filipino](i18n/phi/CODEBASE_DOCUMENTATION.md) | 🇨🇿 [Čeština](i18n/cs/CODEBASE_DOCUMENTATION.md)

> A comprehensive, beginner-friendly guide to the **routiform** multi-provider AI proxy router.

---

## 1. What Is routiform?

routiform is a **proxy router** that sits between AI clients (Claude CLI, Codex, Cursor IDE, etc.) and AI providers (Anthropic, Google, OpenAI, AWS, GitHub, etc.). It solves one big problem:

> **Different AI clients speak different "languages" (API formats), and different AI providers expect different "languages" too.** routiform translates between them automatically.

Think of it like a universal translator at the United Nations — any delegate can speak any language, and the translator converts it for any other delegate.

---

## 2. Architecture Overview

```mermaid
graph LR
    subgraph Clients
        A[Claude CLI]
        B[Codex]
        C[Cursor IDE]
        D[OpenAI-compatible]
    end

    subgraph routiform
        E[Handler Layer]
        F[Translator Layer]
        G[Executor Layer]
        H[Services Layer]
    end

    subgraph Providers
        I[Anthropic Claude]
        J[Google Gemini]
        K[OpenAI / Codex]
        L[GitHub Copilot]
        M[AWS Kiro]
        N[Antigravity]
        O[Cursor API]
    end

    A --> E
    B --> E
    C --> E
    D --> E
    E --> F
    F --> G
    G --> I
    G --> J
    G --> K
    G --> L
    G --> M
    G --> N
    G --> O
    H -.-> E
    H -.-> G
```

### Core Principle: Hub-and-Spoke Translation

All format translation passes through **OpenAI format as the hub**:

```
Client Format → [OpenAI Hub] → Provider Format    (request)
Provider Format → [OpenAI Hub] → Client Format    (response)
```

This means you only need **N translators** (one per format) instead of **N²** (every pair).

---

## 3. Project Structure

```
routiform/
├── open-sse/                  ← Core proxy library (portable, framework-agnostic)
│   ├── index.js               ← Main entry point, exports everything
│   ├── config/                ← Configuration & constants
│   ├── executors/             ← Provider-specific request execution
│   ├── handlers/              ← Request handling orchestration
│   ├── services/              ← Business logic (auth, models, fallback, usage)
│   ├── translator/            ← Format translation engine
│   │   ├── request/           ← Request translators (8 files)
│   │   ├── response/          ← Response translators (7 files)
│   │   └── helpers/           ← Shared translation utilities (7 files)
│   └── utils/                 ← Utility functions
├── src/                       ← Application layer (Express/Worker runtime)
│   ├── app/                   ← Web UI, API routes, middleware
│   ├── lib/                   ← Database, auth, and shared library code
│   ├── mitm/                  ← Man-in-the-middle proxy utilities
│   ├── models/                ← Database models
│   ├── shared/                ← Shared utilities (wrappers around open-sse)
│   ├── sse/                   ← SSE endpoint handlers
│   └── store/                 ← State management
├── data/                      ← Runtime data (credentials, logs)
│   └── provider-credentials.json   (external credentials override, gitignored)
└── tester/                    ← Test utilities
```

---

## 4. Module-by-Module Breakdown

### 4.1 Config (`open-sse/config/`)

The **single source of truth** for all provider configuration.

| File                          | Purpose                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `constants.ts`                | `PROVIDERS` object with base URLs, OAuth credentials (defaults), headers, and default system prompts for every provider. Also defines `HTTP_STATUS`, `ERROR_TYPES`, `COOLDOWN_MS`, `BACKOFF_CONFIG`, and `SKIP_PATTERNS`. |
| `credentialLoader.ts`         | Loads external credentials from `data/provider-credentials.json` and merges them over the hardcoded defaults in `PROVIDERS`. Keeps secrets out of source control while maintaining backwards compatibility.               |
| `providerModels.ts`           | Central model registry: maps provider aliases → model IDs. Functions like `getModels()`, `getProviderByAlias()`, `getClaudeCodeDefaultModels()`.                                                                          |
| `codexInstructions.ts`        | System instructions injected into Codex requests (editing constraints, sandbox rules, approval policies).                                                                                                                 |
| `defaultThinkingSignature.ts` | Default "thinking" signatures for Claude and Gemini models.                                                                                                                                                               |
| `ollamaModels.ts`             | Schema definition for local Ollama models (name, size, family, quantization).                                                                                                                                             |

#### Credential Loading Flow

```mermaid
flowchart TD
    A["App starts"] --> B["constants.ts defines PROVIDERS\nwith hardcoded defaults"]
    B --> C{"data/provider-credentials.json\nexists?"}
    C -->|Yes| D["credentialLoader reads JSON"]
    C -->|No| E["Use hardcoded defaults"]
    D --> F{"For each provider in JSON"}
    F --> G{"Provider exists\nin PROVIDERS?"}
    G -->|No| H["Log warning, skip"]
    G -->|Yes| I{"Value is object?"}
    I -->|No| J["Log warning, skip"]
    I -->|Yes| K["Merge clientId, clientSecret,\ntokenUrl, authUrl, refreshUrl"]
    K --> F
    H --> F
    J --> F
    F -->|Done| L["PROVIDERS ready with\nmerged credentials"]
    E --> L
```

---

### 4.2 Executors (`open-sse/executors/`)

Executors encapsulate **provider-specific logic** using the **Strategy Pattern**. Each executor overrides base methods as needed.

```mermaid
classDiagram
    class BaseExecutor {
        +buildUrl(model, stream, options)
        +buildHeaders(credentials, stream, body)
        +transformRequest(body, model, stream, credentials)
        +execute(url, options)
        +shouldRetry(status, error)
        +refreshCredentials(credentials, log)
    }

    class DefaultExecutor {
        +refreshCredentials()
    }

    class AntigravityExecutor {
        +buildUrl()
        +buildHeaders()
        +transformRequest()
        +shouldRetry()
        +refreshCredentials()
    }

    class CursorExecutor {
        +buildUrl()
        +buildHeaders()
        +transformRequest()
        +parseResponse()
        +generateChecksum()
    }

    class KiroExecutor {
        +buildUrl()
        +buildHeaders()
        +transformRequest()
        +parseEventStream()
        +refreshCredentials()
    }

    BaseExecutor <|-- DefaultExecutor
    BaseExecutor <|-- AntigravityExecutor
    BaseExecutor <|-- CursorExecutor
    BaseExecutor <|-- KiroExecutor
    BaseExecutor <|-- CodexExecutor
    BaseExecutor <|-- GeminiCLIExecutor
    BaseExecutor <|-- GithubExecutor
```

| Executor         | Provider                                   | Key Specializations                                                                                                                                                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base.ts`        | —                                          | Abstract base: URL building, headers, retry logic, credential refresh                                                                                                                                                                                                                                                                                                |
| `default.ts`     | Claude, Gemini, OpenAI, GLM, Kimi, MiniMax | Generic OAuth token refresh for standard providers                                                                                                                                                                                                                                                                                                                   |
| `antigravity.ts` | Google Cloud Code                          | Project/session ID generation, multi-URL fallback, custom retry parsing from error messages ("reset after 2h7m23s")                                                                                                                                                                                                                                                  |
| `cursor.ts`      | Cursor IDE                                 | **Most complex**: SHA-256 checksum auth, Protobuf request encoding, binary EventStream → SSE response parsing                                                                                                                                                                                                                                                        |
| `codex.ts`       | OpenAI Codex                               | Uses shared token-refresh dedup path, manages thinking levels, converts native passthrough `input` role `system` → `developer` on both passthrough and non-passthrough paths, strips unsupported token-cap aliases, strips stored-item references (`stripStoredItemReferences`), defaults `store=true`, injects `originator`/`session_id`/`prompt_cache_key` headers |
| `gemini-cli.ts`  | Google Gemini CLI                          | Custom URL building (`streamGenerateContent`), Google OAuth token refresh                                                                                                                                                                                                                                                                                            |
| `github.ts`      | GitHub Copilot                             | Dual token system (GitHub OAuth + Copilot token), VSCode header mimicking                                                                                                                                                                                                                                                                                            |
| `kiro.ts`        | AWS CodeWhisperer                          | AWS EventStream binary parsing, AMZN event frames, token estimation                                                                                                                                                                                                                                                                                                  |
| `index.ts`       | —                                          | Factory: maps provider name → executor class, with default fallback                                                                                                                                                                                                                                                                                                  |

---

### 4.3 Handlers (`open-sse/handlers/`)

The **orchestration layer** — coordinates translation, execution, streaming, and error handling.

| File                  | Purpose                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chatCore.ts`         | **Central orchestrator** (~2,094 lines, modularized). Handles the complete request lifecycle: format detection → translation → executor dispatch → streaming/non-streaming response → token refresh → error handling → usage logging. Delegates to phase handlers for idempotency, sanitization, caching, validation, and fallback logic. |
| `responsesHandler.ts` | Adapter for OpenAI's Responses API: converts Responses format → Chat Completions → sends to `chatCore` → converts SSE back to Responses format.                                                                                                                                                                                           |
| `embeddings.ts`       | Embedding generation handler: resolves embedding model → provider, dispatches to provider API, returns OpenAI-compatible embedding response. Supports 6+ providers.                                                                                                                                                                       |
| `imageGeneration.ts`  | Image generation handler: resolves image model → provider, supports OpenAI-compatible, Gemini-image (Antigravity), and fallback (Nebius) modes. Returns base64 or URL images.                                                                                                                                                             |

**Phase Handlers** (`phases/` subdirectory):

| File                            | Purpose                                                                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idempotency-check.ts`          | Duplicate request detection using idempotency keys from request headers. Returns cached response if key matches previous request.                           |
| `input-sanitizer.ts`            | Request normalization: strips empty name fields, enforces media/URL tools, downgrades incompatible tool_choice values, injects memory context when enabled. |
| `semantic-cache-handler.ts`     | Semantic cache lookup based on request signature. Returns cached response for identical requests within time window.                                        |
| `background-task-redirector.ts` | Routes async/background tasks to appropriate handlers based on request characteristics.                                                                     |
| `model-fallback-handler.ts`     | Model-level fallback logic. Attempts alternative models when primary model fails with fallback-eligible errors.                                             |
| `emergency-fallback-handler.ts` | Last-resort fallback strategies when all primary and model-level fallbacks are exhausted.                                                                   |

RTK Token Saver (`open-sse/rtk/`) runs from `chat-core-phase-translate-and-bundle.ts` after inbound translation. When Request context is set to `auto-compress`, it losslessly compacts supported large `tool_result` payloads such as diffs, grep/find/ls/tree output, build logs, duplicate logs, search lists, and numbered file reads.

**Handler Utilities** (`utils/` subdirectory):

| File                            | Purpose                                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cache-log-helpers.ts`          | Cache usage logging utilities: builds log metadata for prompt caching (Claude) and semantic caching, attaches cache metrics to usage logs.         |
| `claude-passthrough-helpers.ts` | Claude tool name mapping for OAuth passthrough mode. Prefixes tool names with `CLAUDE_OAUTH_TOOL_PREFIX` and restores original names in responses. |
| `header-helpers.ts`             | Case-insensitive header access utility for reading HTTP headers regardless of casing.                                                              |

**Handler Chat-Core Modules** (`chat-core/` subdirectory):

| File                               | Purpose                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `chat-core-post-translate-tune.ts` | Post-translation body tuning: extracts tool name map, strips unsupported params per provider, caps `max_tokens`/`max_completion_tokens` to provider limits, normalizes `reasoning_effort` (`xhigh`→`high` for providers that don't support xhigh; strips entirely for providers with no reasoning effort support), and applies GitHub request optimizations. |

**Handler Services** (`services/` subdirectory):

| File                     | Purpose                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `codex-quota-manager.ts` | Codex quota state persistence. Parses quota headers from Codex responses, persists per-model quota state, manages reset times. |

**Handler Types** (`types/` subdirectory):

| File                      | Purpose                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat-request-context.ts` | TypeScript type definitions for request context objects passed through the handler pipeline. Encapsulates body, model info, credentials, callbacks, and metadata. |

#### Request Lifecycle (chatCore.ts)

```mermaid
sequenceDiagram
    participant Client
    participant chatCore
    participant Translator
    participant Executor
    participant Provider

    Client->>chatCore: Request (any format)
    chatCore->>chatCore: Detect source format
    chatCore->>chatCore: Check bypass patterns
    chatCore->>chatCore: Resolve model & provider
    chatCore->>Translator: Translate request (source → OpenAI → target)
    chatCore->>Executor: Get executor for provider
    Executor->>Executor: Build URL, headers, transform request
    Executor->>Executor: Refresh credentials if needed
    Executor->>Provider: HTTP fetch (streaming or non-streaming)

    alt Streaming
        Provider-->>chatCore: SSE stream
        chatCore->>chatCore: Pipe through SSE transform stream
        Note over chatCore: Transform stream translates<br/>each chunk: target → OpenAI → source
        chatCore-->>Client: Translated SSE stream
    else Non-streaming
        Provider-->>chatCore: JSON response
        chatCore->>Translator: Translate response
        chatCore-->>Client: Translated JSON
    end

    alt Error (401, 429, 500...)
        chatCore->>Executor: Retry with credential refresh
        chatCore->>chatCore: Account fallback logic
    end
```

---

### 4.4 Services (`open-sse/services/`)

Business logic that supports the handlers and executors.

| File                 | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider.ts`        | **Format detection** (`detectFormat`): analyzes request body structure to identify Claude/OpenAI/Gemini/Antigravity/Responses formats (includes `max_tokens` heuristic for Claude). Also: URL building, header building, thinking config normalization. Supports `openai-compatible-*` and `anthropic-compatible-*` dynamic providers.                                                                                                                                                                                                                                                                                                                                                                                                |
| `model.ts`           | Model string parsing (`claude/model-name` → `{provider: "claude", model: "model-name"}`), alias resolution with collision detection, input sanitization (rejects path traversal/control chars), and model info resolution with async alias getter support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `accountFallback.ts` | Rate-limit handling: exponential backoff (1s → 2s → 4s → max 2min), account cooldown management, error classification (which errors trigger fallback vs. not).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tokenRefresh.ts`    | OAuth token refresh for **every provider**: Google (Gemini, Antigravity), Claude, Codex, Qwen, Qoder, GitHub (OAuth + Copilot dual-token), Kiro (AWS SSO OIDC + Social Auth). Includes in-flight promise deduplication cache and retry with exponential backoff.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `combo.ts`           | **Combo models**: chains of fallback models. If model A fails with a fallback-eligible error, try model B, then C, etc. Returns actual upstream status codes. Detects HTTP 503 "all accounts rate-limited" responses to trigger combo fallback instead of returning a terminal error.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `usage.ts`           | Fetches quota/usage data from provider APIs (GitHub Copilot quotas, Antigravity model quotas, Codex rate limits, Kiro usage breakdowns, Claude settings).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `accountSelector.ts` | Smart account selection with scoring algorithm: considers priority, health status, round-robin position, and cooldown state to pick the optimal account for each request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `contextManager.ts`  | Context token budgeting and 7-layer compression pipeline: (1) content-type-aware token estimation (text/code/JSON/schema ratios), (2) adaptive reserve calculation, (3) tool definition compaction with variable budgets, (4) signal-aware tool output trimming (preserves errors/warnings, uses head+tail with gap markers), (5) thinking block compression, (6) importance-aware history purification (scores by role/recency/constraints/errors, preserves latest user message), (7) system prompt truncation with instruction-critical prefix preservation. Generates structured compression summaries extracting Goal/Constraints/Decisions/Errors/Issues from dropped content. Returns rich telemetry for dashboard visibility. |
| `ipFilter.ts`        | IP-based access control: supports allowlist and blocklist modes. Validates client IP against configured rules before processing API requests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `sessionManager.ts`  | Session tracking with client fingerprinting: tracks active sessions using hashed client identifiers, monitors request counts, and provides session metrics.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `signatureCache.ts`  | Request signature-based deduplication cache: prevents duplicate requests by caching recent request signatures and returning cached responses for identical requests within a time window.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `systemPrompt.ts`    | Global system prompt injection: prepends or appends a configurable system prompt to all requests, with per-provider compatibility handling.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `thinkingBudget.ts`  | Reasoning token budget management: supports passthrough, auto (strip thinking config), custom (fixed budget), and adaptive (complexity-scaled) modes for controlling thinking/reasoning tokens.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `wildcardRouter.ts`  | Wildcard model pattern routing: resolves wildcard patterns (e.g., `*/claude-*`) to concrete provider/model pairs based on availability and priority.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `reasoningCache.ts`  | Reasoning content cache for providers that require `reasoning_content` replay (DeepSeek, SiliconFlow, Nebius, DeepInfra, SambaNova, Fireworks, Together, OpenCode-Go). Caches reasoning strings keyed by tool-call ID with a 2-hour TTL and 2,000-entry in-memory cap, backed by SQLite for persistence. Model pattern matching covers `deepseek-r1`, `deepseek-reasoner`, `deepseek-chat`, `deepseek-v4`, `kimi-k2`, `qwq`, `qwen.*think`, and `glm.*think`.                                                                                                                                                                                                                                                                         |

**Codex-specific services** (extracted from executors/codex.ts refactor):

| File                         | Purpose                                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codex-quota.ts`             | **Codex quota snapshot parsing** from response headers (5h/7d windows, usage, limits, reset timestamps). Extracts `x-codex-*h-{usage,limit,reset-at}` headers and normalizes them into a structured quota object for downstream persistence.                                                                                     |
| `codex-sse-scan.ts`          | **SSE frame classification** for Codex responses. Distinguishes error frames, content frames, and metadata frames without consuming the stream. Used by codex-sse-peek to categorize frames at the byte level.                                                                                                                   |
| `codex-sse-peek.ts`          | **Bounded error detection** on Codex 200-OK SSE responses. Peeks up to 256 KB and 32 frames (fail-open on timeout). Detects transient "capacity" errors and converts them to 503 for account rotation. Reassembles a byte-identical replacement stream so retries preserve request body hash (including `previous_response_id`). |
| `codex-request-shaping.ts`   | **Request endpoint inference**: detects `responses` format requests (stream→text, chat→native Codex responses endpoint) vs. standard completions. Routes to correct Codex subpath and handles content-type expectations for each endpoint variant.                                                                               |
| `codex-request-transform.ts` | **Codex-specific request transformation**: applies scope-aware rate limiting (codex vs. spark models separate pools), injects default instructions, and normalizes thinking levels. Codex requires explicit `instructions` field for system prompts instead of OpenAI's `system` role.                                           |

#### Token Refresh Deduplication

```mermaid
sequenceDiagram
    participant R1 as Request 1
    participant R2 as Request 2
    participant Cache as refreshPromiseCache
    participant OAuth as OAuth Provider

    R1->>Cache: getAccessToken("gemini", token)
    Cache->>Cache: No in-flight promise
    Cache->>OAuth: Start refresh
    R2->>Cache: getAccessToken("gemini", token)
    Cache->>Cache: Found in-flight promise
    Cache-->>R2: Return existing promise
    OAuth-->>Cache: New access token
    Cache-->>R1: New access token
    Cache-->>R2: Same access token (shared)
    Cache->>Cache: Delete cache entry
```

#### Account Fallback State Machine

```mermaid
stateDiagram-v2
    [*] --> Active
    Active --> Error: Request fails (401/429/500)
    Error --> Cooldown: Apply backoff
    Cooldown --> Active: Cooldown expires
    Active --> Active: Request succeeds (reset backoff)

    state Error {
        [*] --> ClassifyError
        ClassifyError --> ShouldFallback: Rate limit / Auth / Transient
        ClassifyError --> NoFallback: 400 Bad Request
    }

    state Cooldown {
        [*] --> ExponentialBackoff
        ExponentialBackoff: Level 0 = 1s
        ExponentialBackoff: Level 1 = 2s
        ExponentialBackoff: Level 2 = 4s
        ExponentialBackoff: Max = 2min
    }
```

#### Combo Model Chain

```mermaid
flowchart LR
    A["Request with\ncombo model"] --> B["Model A"]
    B -->|"2xx Success"| C["Return response"]
    B -->|"429/401/500"| D{"Fallback\neligible?"}
    D -->|Yes| E["Model B"]
    D -->|No| F["Return error"]
    E -->|"2xx Success"| C
    E -->|"429/401/500"| G{"Fallback\neligible?"}
    G -->|Yes| H["Model C"]
    G -->|No| F
    H -->|"2xx Success"| C
    H -->|"Fail"| I["All failed →\nReturn last status"]
```

---

### 4.5 Translator (`open-sse/translator/`)

The **format translation engine** using a self-registering plugin system.

#### Architecture

```mermaid
graph TD
    subgraph "Request Translation"
        A["Claude → OpenAI"]
        B["Gemini → OpenAI"]
        C["Antigravity → OpenAI"]
        D["OpenAI Responses → OpenAI"]
        E["OpenAI → Claude"]
        F["OpenAI → Gemini"]
        G["OpenAI → Kiro"]
        H["OpenAI → Cursor"]
    end

    subgraph "Response Translation"
        I["Claude → OpenAI"]
        J["Gemini → OpenAI"]
        K["Kiro → OpenAI"]
        L["Cursor → OpenAI"]
        M["OpenAI → Claude"]
        N["OpenAI → Antigravity"]
        O["OpenAI → Responses"]
    end
```

| Directory    | Files         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `request/`   | 8 translators | Convert request bodies between formats. Each file self-registers via `register(from, to, fn)` on import.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `response/`  | 7 translators | Convert streaming response chunks between formats. Handles SSE event types, thinking blocks, tool calls.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `helpers/`   | 8 helpers     | Shared utilities: `claudeHelper` (system prompt extraction, thinking config, tool-result rehydration for cross-provider round-trips, verbatim preservation of latest assistant thinking blocks), `geminiHelper` (parts/contents mapping, schema sanitization), `geminiToolsSanitizer` (tools normalization for Gemini format), `openaiHelper` (format filtering), `toolCallHelper` (ID generation, missing response injection), `maxTokensHelper`, `responsesApiHelper`, `schemaCoercion` (JSON Schema numeric coercion, tool description sanitization, `coerceToolCallArguments` for per-tool array field normalization e.g. `submit_pr_review`). |
| `index.ts`   | —             | Translation engine: `translateRequest()`, `translateResponse()`, state management, registry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `formats.ts` | —             | Format constants: `OPENAI`, `CLAUDE`, `GEMINI`, `ANTIGRAVITY`, `KIRO`, `CURSOR`, `OPENAI_RESPONSES`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

OpenAI Chat → OpenAI Responses request translation normalizes token caps to `max_output_tokens` with precedence: `max_output_tokens` > `max_completion_tokens` > `max_tokens`.
For Codex upstream calls, `CodexExecutor` then rewrites these aliases to `max_tokens` (and removes unsupported aliases) because Codex rejects `max_output_tokens`.

#### Key Design: Self-Registering Plugins

```javascript
// Each translator file calls register() on import:
import { register } from "../index.js";
register("claude", "openai", translateClaudeToOpenAI);

// The index.js imports all translator files, triggering registration:
import "./request/claude-to-openai.js"; // ← self-registers
```

---

### 4.6 Utils (`open-sse/utils/`)

| File               | Purpose                                                                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `error.ts`         | Error response building (OpenAI-compatible format), upstream error parsing, Antigravity retry-time extraction from error messages, SSE error streaming.                                                                                                                              |
| `stream.ts`        | **SSE Transform Stream** — the core streaming pipeline. Two modes: `TRANSLATE` (full format translation) and `PASSTHROUGH` (normalize + extract usage). Handles chunk buffering, usage estimation, content length tracking. Per-stream encoder/decoder instances avoid shared state. |
| `streamHelpers.ts` | Low-level SSE utilities: `parseSSELine` (whitespace-tolerant), `hasValuableContent` (filters empty chunks for OpenAI/Claude/Gemini), `fixInvalidId`, `formatSSE` (format-aware SSE serialization with `perf_metrics` cleanup).                                                       |
| `usageTracking.ts` | Token usage extraction from any format (Claude/OpenAI/Gemini/Responses), estimation with separate tool/message char-per-token ratios, buffer addition (2000 tokens safety margin), format-specific field filtering, console logging with ANSI colors.                                |
| `requestLogger.ts` | File-based request logging (opt-in via `ENABLE_REQUEST_LOGS=true`). Creates session folders with numbered files: `1_req_client.json` → `7_res_client.txt`. All I/O is async (fire-and-forget). Masks sensitive headers.                                                              |
| `bypassHandler.ts` | Intercepts specific patterns from Claude CLI (title extraction, warmup, count) and returns fake responses without calling any provider. Supports both streaming and non-streaming. Intentionally limited to Claude CLI scope.                                                        |
| `networkProxy.ts`  | Resolves outbound proxy URL for a given provider with precedence: provider-specific config → global config → environment variables (`HTTPS_PROXY`/`HTTP_PROXY`/`ALL_PROXY`). Supports `NO_PROXY` exclusions. Caches config for 30s.                                                  |

**Compression module** (`open-sse/compression/`):

| File                | Purpose                                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `caveman-output.ts` | **Output-side model directive** for terser responses. Injects system prompt directive to make models emit compressed output (no filler, preserve language, no invented abbreviations). Supports `lite` and `full` levels (off by default via `cavemanOutputLevel` setting). Upstream rules preserve code blocks, security warnings, and multi-step sequences exactly. |
| `caveman-en.ts`     | **Input-side regex rewriter** stripping filler from English prompt text (historical, predates output-side). Distinct from caveman-output directive.                                                                                                                                                                                                                   |
| `pipeline.ts`       | RTK Token Saver integration point and compression orchestration pipeline. Wires caveman directives and input-side rewriting into the request path.                                                                                                                                                                                                                    |
| `types.ts`          | TypeScript type definitions for compression configuration and results.                                                                                                                                                                                                                                                                                                |

#### SSE Streaming Pipeline

```mermaid
flowchart TD
    A["Provider SSE stream"] --> B["TextDecoder\n(per-stream instance)"]
    B --> C["Buffer lines\n(split on newline)"]
    C --> D["parseSSELine()\n(trim whitespace, parse JSON)"]
    D --> E{"Mode?"}
    E -->|TRANSLATE| F["translateResponse()\ntarget → OpenAI → source"]
    E -->|PASSTHROUGH| G["fixInvalidId()\nnormalize chunk"]
    F --> H["hasValuableContent()\nfilter empty chunks"]
    G --> H
    H -->|"Has content"| I["extractUsage()\ntrack token counts"]
    H -->|"Empty"| J["Skip chunk"]
    I --> K["formatSSE()\nserialize + clean perf_metrics"]
    K --> L["TextEncoder\n(per-stream instance)"]
    L --> M["Enqueue to\nclient stream"]

    style A fill:#f9f,stroke:#333
    style M fill:#9f9,stroke:#333
```

#### Request Logger Session Structure

```
logs/
└── claude_gemini_claude-sonnet_20260208_143045/
    ├── 1_req_client.json      ← Raw client request
    ├── 2_req_source.json      ← After initial conversion
    ├── 3_req_openai.json      ← OpenAI intermediate format
    ├── 4_req_target.json      ← Final target format
    ├── 5_res_provider.txt     ← Provider SSE chunks (streaming)
    ├── 5_res_provider.json    ← Provider response (non-streaming)
    ├── 6_res_openai.txt       ← OpenAI intermediate chunks
    ├── 7_res_client.txt       ← Client-facing SSE chunks
    └── 6_error.json           ← Error details (if any)
```

---

### 4.7 Application Layer (`src/`)

| Directory     | Purpose                                                                |
| ------------- | ---------------------------------------------------------------------- |
| `src/app/`    | Web UI, API routes, Express middleware, OAuth callback handlers        |
| `src/lib/`    | Database access (`localDb.ts`, `usageDb.ts`), authentication, shared   |
| `src/mitm/`   | Man-in-the-middle proxy utilities for intercepting provider traffic    |
| `src/models/` | Database model definitions                                             |
| `src/shared/` | Wrappers around open-sse functions (provider, stream, error, etc.)     |
| `src/sse/`    | SSE endpoint handlers that wire the open-sse library to Express routes |
| `src/store/`  | Application state management                                           |

#### Notable API Routes

| Route                                         | Methods         | Purpose                                                                                                                                                           |
| --------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/provider-models`                        | GET/POST/DELETE | CRUD for custom models per provider                                                                                                                               |
| `/api/models/catalog`                         | GET             | Aggregated catalog of all models (chat, embedding, image, custom) grouped by provider                                                                             |
| `/api/models/test`                            | POST            | Internal model smoke test route; probes `/api/v1/chat/completions` with a 30s timeout (in-process by default, HTTP fetch when `ROUTIFORM_MODEL_TEST_USE_FETCH=1`) |
| `/api/settings/proxy`                         | GET/PUT/DELETE  | Hierarchical outbound proxy configuration (`global/providers/combos/keys`)                                                                                        |
| `/api/settings/proxy/test`                    | POST            | Validates proxy connectivity and returns public IP/latency                                                                                                        |
| `/v1/providers/[provider]/chat/completions`   | POST            | Dedicated per-provider chat completions with model validation                                                                                                     |
| `/v1/providers/[provider]/embeddings`         | POST            | Dedicated per-provider embeddings with model validation                                                                                                           |
| `/v1/providers/[provider]/images/generations` | POST            | Dedicated per-provider image generation with model validation                                                                                                     |
| `/api/settings/ip-filter`                     | GET/PUT         | IP allowlist/blocklist management                                                                                                                                 |
| `/api/settings/thinking-budget`               | GET/PUT         | Reasoning token budget configuration (passthrough/auto/custom/adaptive)                                                                                           |
| `/api/settings/system-prompt`                 | GET/PUT         | Global system prompt injection for all requests                                                                                                                   |
| `/api/sessions`                               | GET             | Active session tracking and metrics                                                                                                                               |
| `/api/rate-limits`                            | GET             | Per-account rate limit status                                                                                                                                     |
| `/owui/api/v1/chats`                          | GET/POST/DELETE | Chat history management (list, create, update, delete conversations)                                                                                               |
| `/owui/api/v1/chats/[id]`                     | GET/PATCH       | Individual chat retrieval and updates (title, model, system prompt)                                                                                                |
| `/owui/api/v1/chats/[id]/share`               | POST            | Share conversation with link                                                                                                                                      |
| `/owui/api/v1/chats/import`                   | POST            | Import chat backup (with file upload)                                                                                                                             |
| `/owui/api/chat/completions`                  | POST            | Chat completion with task-based streaming (returns `{ task_ids, chat_id }`, emits tokens via socket.io)                                                          |
| `/owui/api/v1/memories`                       | GET/POST/DELETE | Chat memories and custom context                                                                                                                                  |

#### Chat Architecture (native Open WebUI)

The chat at `/owui` is a vendored SvelteKit SPA with a task-based completion model:

**Key modules:**
- `src/app/owui/api/*` — Next.js backend (40+ routes covering chat CRUD, completions, memories, settings)
- `src/lib/owui/socket-server.ts` — socket.io server for token streaming (loopback-only, port 20130)
- `src/lib/owui/chat-tree.ts` — message tree reconstruction from SQLite (builds full history for model context)
- `src/lib/owui/chat-dto.ts` — data transfer objects for API responses
- `src/lib/owui/chat-tasks.ts` — task scheduling and background completion handling
- `src/lib/chat/attachments.ts` — file upload management (content-addressed by sha256)
- `src/lib/chat/router-client.ts` — client-side HTTP wrapper for owui API calls
- `src/lib/db/owui-chats.ts` — SQLite CRUD for `owui_chats` (whole conversation tree in one JSON column)
- `src/lib/db/owui-memories.ts` — SQLite CRUD for `owui_memories`
- `src/lib/db/owui-settings.ts` — single-row `owui_settings` blob
- `src/lib/db/chat-attachments.ts` — content-addressed attachment store (`chat_attachments`)

**Streaming:**
1. POST `/owui/api/chat/completions` → returns immediately with `{ task_ids, chat_id }` (the request carries no `messages`; the server rebuilds history from the stored tree)
2. Backend enqueues completion task
3. Task fetches from `/v1/chat/completions` (Routiform proxy)
4. Tokens stream via socket.io events to the client's session

**Storage:**
- `owui_chats` — one row per chat; the full Open WebUI message TREE (`history.messages` keyed by id, with `parentId`/`childrenIds`/`currentId`) lives in a single JSON `chat` column, alongside `title`, `created_at`, `updated_at`, `archived`, `pinned`, `folder_id`, `share_id`
- `owui_memories` — user memories injected server-side as a system turn (`id`, `content`, `created_at`, `updated_at`)
- `owui_settings` — single-row settings blob (`id` CHECK = 1, `settings` JSON, `updated_at`)
- `chat_attachments` — content-addressed blobs (`sha256` PK, `mime`, `bytes`, `data`, `filename`, `created_at`); referenced by sha256 from the message tree

---

## 5. Key Design Patterns

### 5.1 Hub-and-Spoke Translation

All formats translate through **OpenAI format as the hub**. Adding a new provider only requires writing **one pair** of translators (to/from OpenAI), not N pairs.

### 5.2 Executor Strategy Pattern

Each provider has a dedicated executor class inheriting from `BaseExecutor`. The factory in `executors/index.ts` selects the right one at runtime.

### 5.3 Self-Registering Plugin System

Translator modules register themselves on import via `register()`. Adding a new translator is just creating a file and importing it.

### 5.4 Account Fallback with Exponential Backoff

When a provider returns 429/401/500, the system can switch to the next account, applying exponential cooldowns (1s → 2s → 4s → max 2min).

### 5.5 Combo Model Chains

A "combo" groups multiple `provider/model` strings. If the first fails, fallback to the next automatically.

### 5.6 Stateful Streaming Translation

Response translation maintains state across SSE chunks (thinking block tracking, tool call accumulation, content block indexing) via the `initState()` mechanism.

### 5.7 Usage Safety Buffer

A 2000-token buffer is added to reported usage to prevent clients from hitting context window limits due to overhead from system prompts and format translation.

---

## 6. Supported Formats

| Format                  | Direction       | Identifier         |
| ----------------------- | --------------- | ------------------ |
| OpenAI Chat Completions | source + target | `openai`           |
| OpenAI Responses API    | source + target | `openai-responses` |
| Anthropic Claude        | source + target | `claude`           |
| Google Gemini           | source + target | `gemini`           |
| Google Gemini CLI       | target only     | `gemini-cli`       |
| Antigravity             | source + target | `antigravity`      |
| AWS Kiro                | target only     | `kiro`             |
| Cursor                  | target only     | `cursor`           |

---

## 7. Supported Providers

| Provider                 | Auth Method            | Executor    | Key Notes                                     |
| ------------------------ | ---------------------- | ----------- | --------------------------------------------- |
| Anthropic Claude         | API key or OAuth       | Default     | Uses `x-api-key` header                       |
| Google Gemini            | API key or OAuth       | Default     | Uses `x-goog-api-key` header                  |
| Google Gemini CLI        | OAuth                  | GeminiCLI   | Uses `streamGenerateContent` endpoint         |
| Antigravity              | OAuth                  | Antigravity | Multi-URL fallback, custom retry parsing      |
| OpenAI                   | API key                | Default     | Standard Bearer auth                          |
| Codex                    | OAuth                  | Codex       | Injects system instructions, manages thinking |
| GitHub Copilot           | OAuth + Copilot token  | Github      | Dual token, VSCode header mimicking           |
| Kiro (AWS)               | AWS SSO OIDC or Social | Kiro        | Binary EventStream parsing                    |
| Cursor IDE               | Checksum auth          | Cursor      | Protobuf encoding, SHA-256 checksums          |
| Qwen                     | OAuth                  | Default     | Standard auth                                 |
| Qoder                    | OAuth (Basic + Bearer) | Default     | Dual auth header                              |
| OpenRouter               | API key                | Default     | Standard Bearer auth                          |
| DeepInfra                | API key                | Default     | Standard Bearer auth, provider model listing  |
| SambaNova                | API key                | Default     | Standard Bearer auth, provider model listing  |
| Venice.ai                | API key                | Default     | Standard Bearer auth, provider model listing  |
| GLM, Kimi, MiniMax       | API key                | Default     | Claude-compatible, use `x-api-key`            |
| `openai-compatible-*`    | API key                | Default     | Dynamic: any OpenAI-compatible endpoint       |
| `anthropic-compatible-*` | API key                | Default     | Dynamic: any Claude-compatible endpoint       |

---

## 8. Data Flow Summary

### Streaming Request

```mermaid
flowchart LR
    A["Client"] --> B["detectFormat()"]
    B --> C["translateRequest()\nsource → OpenAI → target"]
    C --> D["Executor\nbuildUrl + buildHeaders"]
    D --> E["fetch(providerURL)"]
    E --> F["createSSEStream()\nTRANSLATE mode"]
    F --> G["parseSSELine()"]
    G --> H["translateResponse()\ntarget → OpenAI → source"]
    H --> I["extractUsage()\n+ addBuffer"]
    I --> J["formatSSE()"]
    J --> K["Client receives\ntranslated SSE"]
    K --> L["logUsage()\nsaveRequestUsage()"]
```

### Non-Streaming Request

```mermaid
flowchart LR
    A["Client"] --> B["detectFormat()"]
    B --> C["translateRequest()\nsource → OpenAI → target"]
    C --> D["Executor.execute()"]
    D --> E["translateResponse()\ntarget → OpenAI → source"]
    E --> F["Return JSON\nresponse"]
```

### Bypass Flow (Claude CLI)

```mermaid
flowchart LR
    A["Claude CLI request"] --> B{"Match bypass\npattern?"}
    B -->|"Title/Warmup/Count"| C["Generate fake\nOpenAI response"]
    B -->|"No match"| D["Normal flow"]
    C --> E["Translate to\nsource format"]
    E --> F["Return without\ncalling provider"]
```

---

## 9. Two Verification Traps

Both of these have let real bugs reach production while the test suite was fully green. Read them before trusting a green run.

### 9.1 A test that does not enter through the real caller proves nothing

The request path is `translateRequest` → chat-core phases → executor → `createSSEStream`. Bugs on this codebase overwhelmingly live in the **wiring between** those layers, not inside the helpers. A test that calls a helper with a hand-built input exercises the author's mental model of the wiring, not the wiring.

Three separate bugs shipped green because their tests did exactly that:

| Bug                                                                     | What the test called                          | What the wiring actually did                                                                            |
| ----------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Kiro received no system prompt from Claude Code                         | `buildKiroPayload()` directly                 | `translator/index.ts` deleted every system message _before_ `buildKiroPayload` ran                      |
| A terseness directive was injected into JSON-schema requests            | `injectCavemanOutputDirective(handBuiltBody)` | the real call site passes the **translated** body, where `response_format` has already been consumed    |
| OpenAI traffic was billed a ~2000-token estimate instead of the real 57 | asserted on a hand-built usage object         | the real usage frame (`{"choices":[],"usage":{…}}`) is `continue`d ~87 lines before the accounting code |

**Rule:** a regression test for anything on the request/response path must drive `translateRequest`, `createSSEStream`, or the real chat-core phase. Direct helper tests are fine as _additional_ unit coverage — they must not be the only coverage.

### 9.2 `npm run typecheck:core` does not typecheck the project

`tsconfig.typecheck-core.json` sets `include: []` and lists **19 explicit files**. Everything else — the entire `open-sse/` engine included — is invisible to it. There is no project-wide typecheck script.

Use this instead:

```bash
npx tsc --pretty false -p tsconfig.json --noEmit
```

It reports a small number of known pre-existing errors; the bar is "no _new_ errors", not "zero output". Note the base config runs `strict: false`, so `strictNullChecks` is off — discriminated unions do **not** narrow through a type guard, and a union that looks correct will fail to compile only under the real config.
