# CLI Tools Setup Guide — Routiform

This guide explains how to install and configure all supported AI coding CLI tools
to use **Routiform** as the unified backend, giving you centralized key management,
cost tracking, model switching, and request logging across every tool.

---

## How It Works

```
Claude / Codex / OpenCode / Cline / KiloCode / Continue / Kiro / Cursor / Copilot
           │
           ▼  (all point to Routiform)
    http://YOUR_SERVER:20128/v1
           │
           ▼  (Routiform routes to the right provider)
    Anthropic / OpenAI / Gemini / DeepSeek / Groq / Mistral / ...
```

**Benefits:**

- One API key to manage all tools
- Cost tracking across all CLIs in the dashboard
- Model switching without reconfiguring every tool
- Works locally and on remote servers (VPS)

### Docker full mode

If you run Routiform from Docker and want `/dashboard/cli-tools` to detect host-side
CLI configs without cloning the repo, use the published compose file:

```bash
curl -L -o docker-compose.full.yml \
  https://raw.githubusercontent.com/linhnguyen-gt/Routiform/main/docker-compose.full.yml

INITIAL_PASSWORD="change_your_password" \
docker compose -f docker-compose.full.yml up -d
```

This mounts common host config directories into the container so the dashboard can
detect installed/configured tools more accurately even when a host CLI binary is not
directly runnable inside the Linux container.

---

## Supported Tools (Dashboard Source of Truth)

The dashboard cards in `/dashboard/cli-tools` are generated from `src/shared/constants/cliTools.ts`,
which is the source of truth for this table:

| Tool               | ID            | Command    | Setup Mode | Install Method |
| ------------------ | ------------- | ---------- | ---------- | -------------- |
| **Claude Code**    | `claude`      | `claude`   | env        | npm            |
| **OpenAI Codex**   | `codex`       | `codex`    | custom     | npm            |
| **Factory Droid**  | `droid`       | `droid`    | custom     | bundled/CLI    |
| **OpenClaw**       | `openclaw`    | `openclaw` | custom     | bundled/CLI    |
| **Cursor**         | `cursor`      | app        | guide      | desktop app    |
| **Windsurf**       | `windsurf`    | app        | guide      | desktop app    |
| **Cline**          | `cline`       | `cline`    | custom     | npm            |
| **Kilo Code**      | `kilo`        | `kilocode` | custom     | npm            |
| **Continue**       | `continue`    | extension  | guide      | VS Code        |
| **Antigravity**    | `antigravity` | internal   | mitm       | Routiform      |
| **GitHub Copilot** | `copilot`     | extension  | custom     | VS Code        |
| **OpenCode**       | `opencode`    | `opencode` | guide      | npm            |
| **Qwen Code**      | `qwen`        | `qwen`     | guide      | npm            |
| **Kiro AI**        | `kiro`        | app/cli    | mitm       | desktop/CLI    |
| **Cowork**         | `cowork`      | app        | custom     | desktop app    |
| **Hermes**         | `hermes`      | `hermes`   | custom     | CLI            |

### CLI fingerprint sync (Agents + Settings)

`/dashboard/agents` and `Settings > CLI Fingerprint` use `src/shared/constants/cliCompatProviders.ts`.
This keeps provider IDs aligned with CLI cards and legacy IDs.

| CLI ID                                                                                                        | Fingerprint Provider ID |
| ------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `kilo`                                                                                                        | `kilocode`              |
| `copilot`                                                                                                     | `github`                |
| `claude` / `codex` / `antigravity` / `kiro` / `cursor` / `cline` / `opencode` / `droid` / `openclaw` / `qwen` | same ID                 |

Legacy IDs still accepted for compatibility: `copilot`, `kimi-coding`.

---

## Step 1 — Get an Routiform API Key

1. Open the Routiform dashboard → **API Manager** (`/dashboard/api-manager`)
2. Click **Create API Key**
3. Give it a name (e.g. `cli-tools`) and select all permissions
4. Copy the key — you'll need it for every CLI below

> Your key looks like: `sk-xxxxxxxxxxxxxxxx-xxxxxxxxx`

---

## Step 2 — Install CLI Tools

All npm-based tools require Node.js 22+ (skip Node 23; Node 24+ OK):

```bash
# Claude Code (Anthropic)
npm install -g @anthropic-ai/claude-code

# OpenAI Codex
npm install -g @openai/codex

# OpenCode
npm install -g opencode-ai

# Cline
npm install -g cline

# KiloCode
npm install -g kilocode

# Kiro CLI (Amazon — requires curl + unzip)
apt-get install -y unzip   # on Debian/Ubuntu
curl -fsSL https://cli.kiro.dev/install | bash
export PATH="$HOME/.local/bin:$PATH"   # add to ~/.bashrc
```

**Verify:**

```bash
claude --version     # 2.x.x
codex --version      # 0.x.x
opencode --version   # x.x.x
cline --version      # 2.x.x
kilocode --version   # x.x.x (or: kilo --version)
kiro-cli --version   # 1.x.x
```

---

## Step 3 — Set Global Environment Variables

Add to `~/.bashrc` (or `~/.zshrc`), then run `source ~/.bashrc`:

```bash
# Routiform Universal Endpoint
export OPENAI_BASE_URL="http://localhost:20128/v1"
export OPENAI_API_KEY="sk-your-routiform-key"
export ANTHROPIC_BASE_URL="http://localhost:20128/v1"
export ANTHROPIC_API_KEY="sk-your-routiform-key"
export GEMINI_BASE_URL="http://localhost:20128/v1"
export GEMINI_API_KEY="sk-your-routiform-key"
```

> For a **remote server** replace `localhost:20128` with the server IP or domain,
> e.g. `http://192.168.0.15:20128`.

---

## Step 4 — Configure Each Tool

### Claude Code

Claude Code reads the endpoint from the `env` block of its settings file, not from a
top-level key, and has no CLI flag for it:

```bash
mkdir -p ~/.claude && cat > ~/.claude/settings.json << EOF
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:20128/v1",
    "ANTHROPIC_AUTH_TOKEN": "sk-your-routiform-key",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "auto"
  }
}
EOF
```

`ANTHROPIC_DEFAULT_OPUS_MODEL` and `ANTHROPIC_DEFAULT_HAIKU_MODEL` map the other two
aliases; omit them to leave those aliases on Anthropic's own models.

**Test:** `claude "say hello"`

---

### OpenAI Codex

Codex takes the endpoint from a named provider in `config.toml` and the key from a
separate `auth.json`:

```bash
mkdir -p ~/.codex && cat > ~/.codex/config.toml << EOF
model = "auto"
model_provider = "routiform"
model_context_window = 300000

[model_providers.routiform]
name = "Routiform"
base_url = "http://localhost:20128/v1"
wire_api = "responses"
EOF

cat > ~/.codex/auth.json << EOF
{ "OPENAI_API_KEY": "sk-your-routiform-key" }
EOF
```

`model_context_window` is what stops Codex from reporting the context meter against its
own 272k fallback for a slug it does not recognise. Codex clamps the value to the model's
`max_context_window`, so it can correct a window downwards but not raise one above that
fallback.

**Test:** `codex "what is 2+2?"`

---

### OpenCode

OpenCode reads `opencode.json` — there is no `config.toml`. A provider entry needs the npm
package that serves it, and `limit` is what the context meter is calculated from:

```bash
mkdir -p ~/.config/opencode && cat > ~/.config/opencode/opencode.json << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "routiform-openai": {
      "npm": "@ai-sdk/openai",
      "name": "Routiform OpenAI",
      "options": {
        "baseURL": "http://localhost:20128/v1",
        "apiKey": "sk-your-routiform-key"
      },
      "models": {
        "auto": { "name": "auto", "limit": { "context": 300000, "output": 64000 } }
      }
    }
  },
  "model": "routiform-openai/auto"
}
EOF
```

Anthropic models go under a second `routiform-anthropic` provider with
`"npm": "@ai-sdk/anthropic"`. Without the root `model`, opencode stays on whatever default
it resolves on its own and the provider above is never used.

**Test:** `opencode`

---

### Cline (CLI or VS Code)

**CLI mode:**

Cline keeps a separate provider for its Act and Plan modes, and the key lives in its
secrets store rather than in `globalState.json`:

```bash
mkdir -p ~/.cline/data && cat > ~/.cline/data/globalState.json << EOF
{
  "actModeApiProvider": "openai",
  "planModeApiProvider": "openai",
  "openAiBaseUrl": "http://localhost:20128/v1",
  "openAiModelId": "auto",
  "planModeOpenAiModelId": "auto"
}
EOF

cat > ~/.cline/data/secrets.json << EOF
{ "openAiApiKey": "sk-your-routiform-key" }
EOF
```

**VS Code mode:**
Cline extension settings → API Provider: `OpenAI Compatible` → Base URL: `http://localhost:20128/v1`

Or use the Routiform dashboard → **CLI Tools → Cline → Apply Config**.

---

### KiloCode (CLI or VS Code)

**CLI mode:**

Kilo splits its configuration across an XDG config file and an XDG data file. On
macOS/Linux those are `~/.config/kilo/kilo.json` and `~/.local/share/kilo/auth.json`;
`XDG_CONFIG_HOME` and `XDG_DATA_HOME` override both.

```bash
mkdir -p ~/.config/kilo && cat > ~/.config/kilo/kilo.json << 'EOF'
{
  "provider": {
    "routiform": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Routiform",
      "options": { "baseURL": "http://localhost:20128/v1" },
      "models": {
        "auto": { "name": "auto", "limit": { "context": 300000, "output": 64000 } }
      }
    }
  },
  "model": "routiform/auto"
}
EOF

mkdir -p ~/.local/share/kilo && cat > ~/.local/share/kilo/auth.json << 'EOF'
{ "routiform": { "type": "api", "key": "sk-your-routiform-key" } }
EOF
```

**VS Code settings:**

The extension is configured from its own settings UI — API Provider `OpenAI Compatible`,
Base URL `http://localhost:20128/v1` — not from `kilo.json`.

Or use the Routiform dashboard → **CLI Tools → KiloCode → Apply Config**.

---

### Continue (VS Code Extension)

Edit `~/.continue/config.yaml`:

```yaml
models:
  - name: Routiform
    provider: openai
    model: auto
    apiBase: http://localhost:20128/v1
    apiKey: sk-your-routiform-key
    default: true
```

Restart VS Code after editing.

---

### Qwen Code

Qwen keys `modelProviders` by auth type and stores an array of model entries under it. It
never keeps credentials in `settings.json` — an entry names the environment variable, and
`~/.qwen/.env` is loaded automatically:

```bash
mkdir -p ~/.qwen && cat > ~/.qwen/settings.json << 'EOF'
{
  "modelProviders": {
    "openai": [
      {
        "id": "auto",
        "name": "auto",
        "envKey": "ROUTIFORM_API_KEY",
        "baseUrl": "http://localhost:20128/v1",
        "generationConfig": { "contextWindowSize": 300000 }
      }
    ]
  },
  "model": { "name": "auto" },
  "security": { "auth": { "selectedType": "openai" } }
}
EOF

echo 'ROUTIFORM_API_KEY=sk-your-routiform-key' > ~/.qwen/.env
```

`model.name` and `security.auth.selectedType` are both required — without them the provider
entry is written but never used. A dedicated variable is used instead of the default
`OPENAI_API_KEY` so this cannot overwrite a real OpenAI key.

Or use the Routiform dashboard → **CLI Tools → Qwen Code → Apply Config** (saves config directly via `/api/cli-tools/guide-settings/qwen`).

**Test:** `qwen "say hello"`

---

### Kiro CLI (Amazon)

```bash
# Login to your AWS/Kiro account:
kiro-cli login

# The CLI uses its own auth — Routiform is not needed as backend for Kiro CLI itself.
# Use kiro-cli alongside Routiform for other tools.
kiro-cli status
```

---

### Cursor (Desktop App)

> **Note:** Cursor routes requests through its cloud. For Routiform integration,
> enable **Cloud Endpoint** in Routiform Settings and use your public domain URL.

Via GUI: **Settings → Models → OpenAI API Key**

- Base URL: `https://your-domain.com/v1`
- API Key: your Routiform key

---

## Dashboard Auto-Configuration

The Routiform dashboard automates configuration for most tools:

1. Go to `http://localhost:20128/dashboard/cli-tools`
2. Expand any tool card
3. Select your API key from the dropdown
4. Click **Apply Config** (if tool is detected as installed)
5. Or copy the generated config snippet manually

---

## Built-in Agents: Droid & OpenClaw

**Droid** and **OpenClaw** are AI agents built directly into Routiform — no installation needed.
They run as internal routes and use Routiform's model routing automatically.

- Access: `http://localhost:20128/dashboard/agents`
- Configure: same combos and providers as all other tools
- No API key or CLI install required

---

## Available API Endpoints

| Endpoint                   | Description                   | Use For                     |
| -------------------------- | ----------------------------- | --------------------------- |
| `/v1/chat/completions`     | Standard chat (all providers) | All modern tools            |
| `/v1/responses`            | Responses API (OpenAI format) | Codex, agentic workflows    |
| `/v1/completions`          | Legacy text completions       | Older tools using `prompt:` |
| `/v1/embeddings`           | Text embeddings               | RAG, search                 |
| `/v1/images/generations`   | Image generation              | DALL-E, Flux, etc.          |
| `/v1/audio/speech`         | Text-to-speech                | ElevenLabs, OpenAI TTS      |
| `/v1/audio/transcriptions` | Speech-to-text                | Deepgram, AssemblyAI        |

---

## Troubleshooting

| Error                     | Cause                   | Fix                                        |
| ------------------------- | ----------------------- | ------------------------------------------ |
| `Connection refused`      | Routiform not running   | `pm2 start routiform`                      |
| `401 Unauthorized`        | Wrong API key           | Check in `/dashboard/api-manager`          |
| `No combo configured`     | No active routing combo | Set up in `/dashboard/combos`              |
| `invalid model`           | Model not in catalog    | Use `auto` or check `/dashboard/providers` |
| CLI shows "not installed" | Binary not in PATH      | Check `which <command>`                    |
| `kiro-cli: not found`     | Not in PATH             | `export PATH="$HOME/.local/bin:$PATH"`     |

---

## Quick Setup Script (One Command)

```bash
# Install all CLIs and configure for Routiform (replace with your key and server URL)
ROUTIFORM_URL="http://localhost:20128/v1"
ROUTIFORM_KEY="sk-your-routiform-key"

npm install -g @anthropic-ai/claude-code @openai/codex opencode-ai cline kilocode

# Qwen Code (via npm)
npm install -g @qwen-code/qwen-code

# Kiro CLI
apt-get install -y unzip 2>/dev/null; curl -fsSL https://cli.kiro.dev/install | bash

# Write configs. Each tool reads a different file in a different shape — see Step 4 above
# for the full form of each; only the two simplest are inlined here.
mkdir -p ~/.claude ~/.codex ~/.config/opencode ~/.continue ~/.qwen

cat > ~/.claude/settings.json <<EOF
{ "env": { "ANTHROPIC_BASE_URL": "$ROUTIFORM_URL", "ANTHROPIC_AUTH_TOKEN": "$ROUTIFORM_KEY" } }
EOF

cat > ~/.codex/config.toml <<EOF
model = "auto"
model_provider = "routiform"

[model_providers.routiform]
name = "Routiform"
base_url = "$ROUTIFORM_URL"
wire_api = "responses"
EOF
cat > ~/.codex/auth.json <<< "{\"OPENAI_API_KEY\":\"$ROUTIFORM_KEY\"}"

echo "ROUTIFORM_API_KEY=$ROUTIFORM_KEY" > ~/.qwen/.env

cat >> ~/.bashrc << EOF
export OPENAI_BASE_URL="$ROUTIFORM_URL"
export OPENAI_API_KEY="$ROUTIFORM_KEY"
export ANTHROPIC_BASE_URL="$ROUTIFORM_URL"
export ANTHROPIC_API_KEY="$ROUTIFORM_KEY"
EOF

source ~/.bashrc
echo "✅ All CLIs installed and configured for Routiform"
```
