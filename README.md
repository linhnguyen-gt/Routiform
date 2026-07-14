# Routiform

One AI endpoint for your apps, tools, and agents.

Routiform is a self-hosted AI gateway and dashboard for teams that want one stable integration point across 60+ providers. You send OpenAI-compatible requests to one `/v1/*` endpoint, and Routiform handles translation, routing, retries, fallback, and operations.

It is built for developers who want to:

- integrate once, then swap providers and models without rewriting client code
- keep Cursor, Devin, Cline, Claude Desktop, Codex, MCP clients, and internal apps on one base URL
- survive provider outages, model deprecations, and quota limits with policy-driven fallback
- reduce cost using combo routing, budget guards, and lower-cost model paths
- run their own gateway with full visibility into keys, logs, quotas, and health

## Why teams choose Routiform

- **One API surface**: OpenAI-compatible routes for chat, embeddings, images, audio, video, rerank, search, and more
- **Resilience by default**: retries, multi-account failover, model-family fallback, and emergency fallback
- **Cost-aware routing**: weighted/priority/P2C strategies, budget controls, and quota-aware decisions
- **Built for agents**: MCP server (25 tools), A2A v0.3 support, memory, and skills
- **Operational control**: dashboard for providers, combos, keys, usage, logs, and endpoint health

<div align="center">

[![npm version](https://img.shields.io/npm/v/routiform?color=cb3837&logo=npm)](https://www.npmjs.com/package/routiform)
[![Docker Hub](https://img.shields.io/docker/v/linhnguyen0944/routiform?label=Docker%20Hub&logo=docker&color=2496ED)](https://hub.docker.com/r/linhnguyen0944/routiform)
[![npm downloads](https://img.shields.io/npm/dm/routiform?label=npm%20downloads&color=red)](https://www.npmjs.com/package/routiform)
[![Docker pulls](https://img.shields.io/docker/pulls/linhnguyen0944/routiform)](https://hub.docker.com/r/linhnguyen0944/routiform)
[![GitHub stars](https://custom-icon-badges.demolab.com/github/stars/linhnguyen-gt/Routiform?logo=star&style=flat)](https://github.com/linhnguyen-gt/Routiform/stargazers)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

</div>

## Product demo

![Routiform dashboard overview](docs/screenshots/MainRoutiform.png)

### Feature demos

| Endpoint workspace                                      | Combo routing builder                               |
| ------------------------------------------------------- | --------------------------------------------------- |
| ![Endpoint dashboard](docs/screenshots/09-endpoint.png) | ![Combos dashboard](docs/screenshots/02-combos.png) |

| Settings and operational controls                       |
| ------------------------------------------------------- |
| ![Settings dashboard](docs/screenshots/06-settings.png) |

These screens show the day-to-day workflow: manage unified endpoints, configure routing combos with fallback policies, and control operational settings from one dashboard.

## Core capabilities

### Unified API gateway

- OpenAI-compatible API surface for chat, embeddings, images, audio, video, rerank, search, and more
- Request and response translation across OpenAI, Anthropic, Gemini, Devin, and provider-specific formats
- Native CLI-backed bridges for providers like Devin, including subprocess execution and streaming normalization back to OpenAI-compatible responses
- Works with local apps, server deployments, CLI tools, browser clients, and agent frameworks

### 60+ providers

Routiform supports a broad provider mix, including:

- OpenAI
- Anthropic
- Devin
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

- Node.js `>=22` (skip Node 23; Node 24–26 supported; see `engines` in package.json)

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
  linhnguyen0944/routiform:cli
```

If you want the dashboard and `/dashboard/cli-tools` to detect your host CLI configs
without cloning this repo, use the published full-mode compose file instead:

```bash
curl -L -o docker-compose.full.yml \
  https://raw.githubusercontent.com/linhnguyen-gt/Routiform/main/docker-compose.full.yml

INITIAL_PASSWORD="change_your_password" \
docker compose -f docker-compose.full.yml up -d
```

That full-mode compose mounts common host config directories for Claude, Codex,
OpenCode, Continue, Cursor, Cline, Kilo, OpenClaw, Qwen, Hermes, Qoder, Devin,
and AWS so the dashboard can detect them more accurately inside Docker.

> **MITM support in Docker:** The MITM proxy (Antigravity, Kiro etc.) can run inside Docker but requires **manual host setup** since the container cannot modify your host's `/etc/hosts` or system keychain. After starting the MITM from the dashboard, run these on your host:

```bash
# 1. Add DNS redirect (run once)
echo '127.0.0.1 daily-cloudcode-pa.googleapis.com' | sudo tee -a /etc/hosts

# 2. Install MITM cert (copy cert from container to host, then install)
docker cp routiform:/app/data/mitm/server.crt /tmp/routiform-mitm.crt
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain /tmp/routiform-mitm.crt
```

If you use `npm install -g routiform` instead, MITM works out of the box — it runs directly on your host with full DNS and keychain access.

If you want to use Devin in plain `docker run` mode, mount only `credentials.toml`
from the host so the Linux CLI inside the container can reuse your existing
credentials without overwriting the bundled Linux install:

```bash
-e DEVIN_BIN=/root/.local/bin/devin \
-v "$HOME/.local/share/devin/credentials.toml:/root/.local/share/devin/credentials.toml:ro"
```

Do not mount `~/.local/bin` or the entire `~/.local/share/devin` directory from
macOS into the container. That can overwrite the Linux Devin binary with macOS
symlinks and cause `spawn devin ENOENT` or binary format errors.

### Option 4: source

Development mode:

```bash
git clone https://github.com/linhnguyen-gt/Routiform.git
cd Routiform
npm install
npm run dev
```

Production build from source:

```bash
git clone https://github.com/linhnguyen-gt/Routiform.git
cd Routiform
npm install
npm run owui:build  # Build the Open WebUI SPA into public/owui (required before Next build)
npm run build       # Build the Next.js application
npm start           # Start the server
```

The `npm run owui:build` step is required — it compiles the vendored Open WebUI (`open-webui/`) 
into `public/owui/`, which is then embedded by Next's `output: standalone`. 
Without it, `/owui` returns 404 and `/dashboard/chat` redirects to a missing chat interface.

### Built-in Chat

The sidebar has a **Chat** entry: a full-featured chat at `/owui` (redirected from `/dashboard/chat`).
It is a vendored Open WebUI SvelteKit SPA with a native Next.js backend that talks to Routiform in-process.
Nothing to install and nothing to launch — it works anywhere Routiform runs, on every install option.

**Features:**
- Streaming completions via socket.io
- Conversation history with search and tagging
- File attachments (images, code, documents)
- Model switching per conversation
- Shared conversation links
- Automatic cost tracking (each message logs its request ID for billing)

Conversations, messages, and attachments are stored in Routiform's own SQLite database (no external service needed).
Images are only offered on models whose request format can actually carry one; the composer indicates unsupported models.

> Earlier versions embedded [Open WebUI](https://github.com/open-webui/open-webui)
> as a separate application, which required Python 3.11 + `uv` on host installs or
> a multi-GB Docker image. The native chat removes that dependency entirely.
> If you ran it before, your old Open WebUI Docker volume (`routiform-open-webui-data`)
> still holds those conversations; it is no longer used and can be removed with
> `docker volume rm routiform-open-webui-data`.

## Management CLI

Routiform includes terminal subcommands for day-to-day management without opening the dashboard.

### Quick examples

```bash
routiform status                              # server up?, version, URLs
routiform provider list                       # list providers
routiform provider add --type openai --key sk-xxx --name "OpenAI"
routiform key create my-key                    # create API key (shown once)
routiform combo list                           # list combos
routiform model list                           # list synced models
routiform settings get                         # show settings
routiform settings set requireLogin true       # set a safe-to-CLI setting
routiform usage                                # usage summary (30d)
routiform logs --tail 20                       # recent server logs
```

All commands support `--json` for raw JSON output (scripting), `--port <n>` to override the port, `--api-key <k>` for auth, and `--yes` to skip confirmation prompts.

### Usage by install option

**npm / npx:**

```bash
# Terminal 1: start server
routiform

# Terminal 2: run CLI subcommands
routiform provider list
```

**Docker (server running in container):**

```bash
docker exec routiform provider list
docker exec routiform status
```

**Host CLI → Docker server (npm on host, server in Docker with ports mapped):**

```bash
ROUTIFORM_API_KEY=<key> routiform provider list --port 20128
```

### Auth

When login is enabled, the CLI automatically reads an API key from the local SQLite DB (`~/.routiform/storage.sqlite` or `DATA_DIR`). If no key exists, it instructs you to set `ROUTIFORM_API_KEY` or create one in the dashboard.

### Available commands

| Command                                                     | Description                                |
| ----------------------------------------------------------- | ------------------------------------------ |
| `routiform status`                                          | Server status, version, URLs               |
| `routiform provider list\|show\|add\|rm\|test\|sync-models` | Provider management                        |
| `routiform key list\|create\|reveal\|rm`                    | API key management                         |
| `routiform combo list\|show\|create\|rm\|test`              | Combo management                           |
| `routiform model list [--provider <id>]`                    | Synced available models                    |
| `routiform settings get\|set`                               | Settings (set uses whitelist of safe keys) |
| `routiform usage`                                           | Usage summary (30d)                        |
| `routiform logs [--tail N]`                                 | Recent server logs                         |

OAuth provider login and visual analytics stay in the web dashboard.

## First-run flow

1. Open `/dashboard`
2. Add one or more provider connections
3. Pick models or sync available models from providers that support live model listing
4. Create a combo if you want fallback or multi-provider routing
5. Point your client to Routiform instead of the upstream provider directly

For Devin connections, authenticate the local CLI first with `devin auth login`, then
import or auto-detect the credentials from the provider setup flow and sync the
available Devin model catalog.

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

Examples include Claude Code, Devin, Codex, GitHub Copilot, Cursor, Cline, Kimi Coding, and other account-backed integrations.

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
- Devin
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
