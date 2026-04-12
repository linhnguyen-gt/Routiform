# Routiform

One AI endpoint for your apps, tools, and agents.

Routiform is a self-hosted AI gateway and dashboard that sits between your clients and 60+ model providers. It exposes one OpenAI-compatible API surface, translates requests across provider formats, and keeps traffic flowing with retries, fallbacks, routing policies, quota awareness, and operational controls.

It is designed for developers who want to:

- stop switching SDKs every time they try a new provider
- keep Cursor, Cline, Claude Desktop, Codex, MCP clients, and custom apps on one base URL
- route to cheaper or free models automatically when premium capacity is unavailable
- run their own gateway instead of sending traffic through a third-party relay
- manage provider keys, combos, quotas, logs, memory, and agent skills from one place

## What Routiform solves

### 1. Too many providers, too many incompatible APIs

Routiform gives you a single `/v1/*` entrypoint and handles provider translation behind the scenes.

### 2. Provider outages and quota exhaustion

Requests can fail over across accounts, providers, or model families instead of hard-failing the client.

### 3. Rising inference costs

Routing can prefer free, lower-cost, or backup models based on policy, quota, and availability.

### 4. Agent tooling fragmentation

Routiform includes an MCP server, A2A protocol support, memory, and skills so agent workflows can run through the same system.

### 5. Operational blind spots

The dashboard centralizes provider connections, model catalogs, combo routing, usage, quotas, logs, API keys, and endpoint health.

---

<div align="center">

[![npm version](https://img.shields.io/npm/v/routiform?color=cb3837&logo=npm)](https://www.npmjs.com/package/routiform)
[![Docker Hub](https://img.shields.io/docker/v/linhnguyen0944/routiform?label=Docker%20Hub&logo=docker&color=2496ED)](https://hub.docker.com/r/linhnguyen0944/routiform)
[![npm downloads](https://img.shields.io/npm/dm/routiform?label=npm%20downloads&color=red)](https://www.npmjs.com/package/routiform)
[![Docker pulls](https://img.shields.io/docker/pulls/linhnguyen0944/routiform)](https://hub.docker.com/r/linhnguyen0944/routiform)
[![GitHub stars](https://custom-icon-badges.demolab.com/github/stars/linhnguyen-gt/Routiform?logo=star&style=flat)](https://github.com/linhnguyen-gt/Routiform/stargazers)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

</div>

## Screenshot

![Routiform dashboard](docs/screenshots/MainRoutiform.png)

## Core capabilities

### Unified API gateway

- OpenAI-compatible API surface for chat, embeddings, images, audio, video, rerank, search, and more
- Request and response translation across OpenAI, Anthropic, Gemini, and provider-specific formats
- Works with local apps, server deployments, CLI tools, browser clients, and agent frameworks

### 60+ providers

Routiform supports a broad provider mix, including:

- OpenAI
- Anthropic
- Google Gemini
- DeepSeek
- Groq
- xAI
- Mistral
- Fireworks
- Cohere
- NVIDIA
- Cerebras
- OpenRouter
- Hugging Face
- Cloudflare AI
- Ollama Cloud
- Together
- Perplexity
- Tavily
- Brave
- Exa
- and many more

Provider types include:

- free providers
- OAuth-backed providers
- API-key providers
- custom OpenAI-compatible providers
- custom Anthropic-compatible providers

### Routing and resilience

- combo-based routing across multiple models/accounts/providers
- weighted, priority, round-robin, P2C, and cost-aware strategies
- model-family fallback and emergency fallback
- multi-account failover inside the same provider
- retry handling and resilience profiles
- rate-limit aware behavior and quota checks
- circuit-breaker style protections for unstable upstreams

### Cost and quota controls

- budget-aware routing controls
- quota snapshots and health checks
- cost reporting endpoints and dashboard views
- low-cost and free-tier friendly setups
- policy-driven model selection for operational or cost goals

### Built-in protocols for agent workflows

- MCP server with 25 tools and multiple transports
- A2A v0.3 support with task lifecycle handling
- memory tools for search/add/clear
- skills system for extensible agent behaviors

### Dashboard and operations

- provider connection management
- model catalog and per-provider model sync
- combo editor and routing strategies
- request logs and detailed logs
- API key manager and scoped access controls
- endpoint health and metrics
- webhook and automation surfaces

## Supported API surfaces

Routiform exposes a unified API under `/v1/*`.

Main routes include:

- `/v1/chat/completions`
- `/v1/responses`
- `/v1/embeddings`
- `/v1/images/generations`
- `/v1/audio/speech`
- `/v1/audio/transcriptions`
- `/v1/moderations`
- `/v1/rerank`
- `/v1/search`
- `/v1/videos/generations`
- `/v1/music/generations`
- `/v1/models`

See [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) for route details.

## MCP server

Routiform ships with an MCP server for operational and routing workflows.

Included tool groups:

- health and provider status
- combo listing and switching
- routing simulation and explanation
- budget and resilience controls
- memory operations
- skill operations

Supported transports:

- stdio
- SSE
- streamable HTTP

See [`docs/MCP-SERVER.md`](docs/MCP-SERVER.md).

## A2A support

Routiform includes an A2A server with:

- JSON-RPC 2.0 task handling
- SSE streaming
- task lifecycle management
- skill exposure for smart routing and quota workflows
- agent discovery via `/.well-known/agent.json`

See [`docs/A2A-SERVER.md`](docs/A2A-SERVER.md).

## Why teams use it instead of wiring providers directly

- one client integration instead of many SDK branches
- self-hosted control over credentials and routing policy
- easier experimentation with new providers and cheaper models
- fewer production incidents from single-provider dependency
- operational visibility without building a custom gateway first
- ready-made agent protocol support instead of stitching MCP/A2A yourself

## Quick start

### Option 1: npm

Requirements:

- Node.js `>=18 <25`

```bash
npm install -g routiform
routiform
```

Open the dashboard:

```text
http://localhost:20128/dashboard
```

Default API base:

```text
http://localhost:20128/v1
```

### Option 2: npx

```bash
npx routiform
```

### Option 3: Docker

```bash
docker pull linhnguyen0944/routiform:cli

docker run -d \
  --name routiform \
  --restart unless-stopped \
  -p 20128:20128 \
  -p 20129:20129 \
  -e DATA_DIR=/app/data \
  -e INITIAL_PASSWORD="change_your_password" \
  -v routiform-data:/app/data \
  -v "$HOME/.claude:/root/.claude" \
  -v "$HOME/.openclaw:/root/.openclaw" \
  -v "$HOME/.config/opencode:/root/.config/opencode" \
  -v "$HOME/.continue:/root/.continue" \
  -v "$HOME/.aws:/root/.aws" \
  linhnguyen0944/routiform:cli
```

### Option 4: source

```bash
git clone https://github.com/linhnguyen-gt/Routiform.git
cd Routiform
npm install
npm run dev
```

## First-run flow

1. Open `/dashboard`
2. Add one or more provider connections
3. Pick models or sync available models from providers that support live model listing
4. Create a combo if you want fallback or multi-provider routing
5. Point your client to Routiform instead of the upstream provider directly

## Example client configuration

### OpenAI SDK compatible clients

```bash
export OPENAI_BASE_URL="http://localhost:20128/v1"
export OPENAI_API_KEY="your-routiform-api-key"
```

### cURL

```bash
curl http://localhost:20128/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-routiform-api-key" \
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [
      {"role": "user", "content": "Hello from Routiform"}
    ]
  }'
```

## Provider categories

### Free

Examples include built-in support for free-access workflows such as Qoder AI, Qwen Code, Kiro AI, and similar sources where available.

### OAuth

Examples include Claude Code, Codex, GitHub Copilot, Cursor, Cline, Kimi Coding, and other account-backed integrations.

### API key

Most commercial providers fit here, including OpenAI, Anthropic, Gemini, Groq, xAI, Mistral, DeepSeek, Fireworks, Cohere, NVIDIA, and more.

### Custom compatible providers

You can register OpenAI-compatible or Anthropic-compatible upstreams using custom base URLs.

## Model routing concepts

### Connections

A connection is one authenticated provider account or endpoint.

### Models

Models can come from:

- built-in provider registries
- synced provider model lists
- custom user-defined model entries

### Combos

A combo is a routing group that tells Routiform which models/providers to try and in what order or policy.

### Policies

Policies influence fallback, degradation, lockout behavior, quota handling, and other runtime decisions.

## Storage and backup

Routiform stores state in SQLite under `DATA_DIR` using `better-sqlite3`.

Default data directory:

```text
~/.routiform/
```

Important backup note:

- back up the entire `DATA_DIR`
- do not copy only `storage.sqlite`
- `server.env` in the same directory contains `STORAGE_ENCRYPTION_KEY`, which is required to restore encrypted provider secrets correctly

See [`docs/BACKUP_AND_RESTORE.md`](docs/BACKUP_AND_RESTORE.md).

## Important environment variables

Common variables:

| Variable                 | Default                       | Purpose                          |
| ------------------------ | ----------------------------- | -------------------------------- |
| `PORT`                   | `20128`                       | HTTP port                        |
| `HOST`                   | `0.0.0.0`                     | Bind address                     |
| `DATA_DIR`               | `~/.routiform`                | State directory                  |
| `REQUEST_TIMEOUT_MS`     | `600000`                      | Shared upstream timeout baseline |
| `STREAM_IDLE_TIMEOUT_MS` | inherits `REQUEST_TIMEOUT_MS` | Max gap between SSE chunks       |

Advanced timeout overrides still exist, including:

- `FETCH_TIMEOUT_MS`
- `FETCH_HEADERS_TIMEOUT_MS`
- `FETCH_BODY_TIMEOUT_MS`
- `API_BRIDGE_PROXY_TIMEOUT_MS`

## Security notes

- do not commit provider keys or session secrets
- use the dashboard API manager for scoped access where possible
- protect exposed deployments with proper auth and network controls
- never log encryption keys
- validate and sanitize user-facing content when building on top of Routiform

## Project structure

Top-level areas:

- `src/` — Next.js app, dashboard, API routes, DB modules, domain logic
- `open-sse/` — request pipeline, executors, translators, handlers, MCP server
- `docs/` — user guides, architecture, API, deployment, troubleshooting
- `tests/` — unit, integration, ecosystem, and protocol coverage

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the deeper layout.

## Development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Build production assets:

```bash
npm run build
npm run start
```

Useful scripts:

```bash
npm run lint
npm run typecheck:core
npm run check
npm run test:all
npm run test:vitest
npm run test:e2e
npm run test:protocols:e2e
npm run test:ecosystem
```

## Docs map

- [User Guide](docs/USER_GUIDE.md)
- [API Reference](docs/API_REFERENCE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [MCP Server](docs/MCP-SERVER.md)
- [A2A Server](docs/A2A-SERVER.md)
- [Auto Combo](docs/AUTO-COMBO.md)
- [CLI Tools](docs/CLI-TOOLS.md)
- [Backup and Restore](docs/BACKUP_AND_RESTORE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Features](docs/FEATURES.md)
- [OpenAPI spec](docs/openapi.yaml)

## Compatibility

Routiform is useful with:

- OpenAI-compatible SDKs
- Cursor
- Cline
- Claude Desktop
- Codex clients
- custom MCP clients
- internal tools and gateways that want one normalized AI interface

## License

MIT

## Acknowledgments 🤝

Routiform wouldn't exist without the foundations laid by:

- [9router](https://github.com/decolua/9router) by @decolua — The original inspiration
- [OmniRoute](https://github.com/diegosouzapw/OmniRoute) by @diegosouzapw — Expanded the vision
- [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) — The original Go implementation that inspired this JavaScript port

## Links

- Repository: <https://github.com/linhnguyen-gt/Routiform>
- npm: <https://www.npmjs.com/package/routiform>
- Docker: <https://hub.docker.com/r/linhnguyen0944/routiform>
