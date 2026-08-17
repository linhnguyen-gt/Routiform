# CLI Tools Setup Guide — Routiform (Magyar)

🌐 **Languages:** 🇺🇸 [English](../../../../docs/CLI-TOOLS.md) · 🇪🇸 [es](../../es/docs/CLI-TOOLS.md) · 🇫🇷 [fr](../../fr/docs/CLI-TOOLS.md) · 🇩🇪 [de](../../de/docs/CLI-TOOLS.md) · 🇮🇹 [it](../../it/docs/CLI-TOOLS.md) · 🇷🇺 [ru](../../ru/docs/CLI-TOOLS.md) · 🇨🇳 [zh-CN](../../zh-CN/docs/CLI-TOOLS.md) · 🇯🇵 [ja](../../ja/docs/CLI-TOOLS.md) · 🇰🇷 [ko](../../ko/docs/CLI-TOOLS.md) · 🇸🇦 [ar](../../ar/docs/CLI-TOOLS.md) · 🇮🇳 [hi](../../hi/docs/CLI-TOOLS.md) · 🇮🇳 [in](../../in/docs/CLI-TOOLS.md) · 🇹🇭 [th](../../th/docs/CLI-TOOLS.md) · 🇻🇳 [vi](../../vi/docs/CLI-TOOLS.md) · 🇮🇩 [id](../../id/docs/CLI-TOOLS.md) · 🇲🇾 [ms](../../ms/docs/CLI-TOOLS.md) · 🇳🇱 [nl](../../nl/docs/CLI-TOOLS.md) · 🇵🇱 [pl](../../pl/docs/CLI-TOOLS.md) · 🇸🇪 [sv](../../sv/docs/CLI-TOOLS.md) · 🇳🇴 [no](../../no/docs/CLI-TOOLS.md) · 🇩🇰 [da](../../da/docs/CLI-TOOLS.md) · 🇫🇮 [fi](../../fi/docs/CLI-TOOLS.md) · 🇵🇹 [pt](../../pt/docs/CLI-TOOLS.md) · 🇷🇴 [ro](../../ro/docs/CLI-TOOLS.md) · 🇭🇺 [hu](../../hu/docs/CLI-TOOLS.md) · 🇧🇬 [bg](../../bg/docs/CLI-TOOLS.md) · 🇸🇰 [sk](../../sk/docs/CLI-TOOLS.md) · 🇺🇦 [uk-UA](../../uk-UA/docs/CLI-TOOLS.md) · 🇮🇱 [he](../../he/docs/CLI-TOOLS.md) · 🇵🇭 [phi](../../phi/docs/CLI-TOOLS.md) · 🇧🇷 [pt-BR](../../pt-BR/docs/CLI-TOOLS.md) · 🇨🇿 [cs](../../cs/docs/CLI-TOOLS.md) · 🇹🇷 [tr](../../tr/docs/CLI-TOOLS.md)

---

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

---

## Supported Tools (Dashboard Source of Truth)

The dashboard cards in `/dashboard/cli-tools` are generated from `src/shared/constants/cliTools.ts`.
Current list (v3.0.0-rc.16):

| Tool               | ID            | Command    | Setup Mode | Install Method      |
| ------------------ | ------------- | ---------- | ---------- | ------------------- |
| **Claude Code**    | `claude`      | `claude`   | env        | npm                 |
| **OpenAI Codex**   | `codex`       | `codex`    | custom     | npm                 |
| **Factory Droid**  | `droid`       | `droid`    | custom     | bundled/CLI         |
| **OpenClaw**       | `openclaw`    | `openclaw` | custom     | bundled/CLI         |
| **Cursor**         | `cursor`      | app        | guide      | desktop app         |
| **Windsurf**       | `windsurf`    | app        | guide      | desktop app         |
| **Cline**          | `cline`       | `cline`    | custom     | npm                 |
| **Kilo Code**      | `kilo`        | `kilocode` | custom     | npm                 |
| **Continue**       | `continue`    | extension  | guide      | VS Code             |
| **Antigravity**    | `antigravity` | internal   | mitm       | Routiform           |
| **GitHub Copilot** | `copilot`     | extension  | custom     | VS Code             |
| **OpenCode**       | `opencode`    | `opencode` | guide      | npm                 |
| **Qwen Code**      | `qwen`        | `qwen`     | guide      | npm                 |
| **Oh My Pi**       | `omp`         | `omp`      | guide      | curl \| brew \| bun |
| **Kimi Code**      | `kimi`        | `kimi`     | guide      | curl \| npm         |
| **Kiro AI**        | `kiro`        | app/cli    | mitm       | desktop/CLI         |
| **Cowork**         | `cowork`      | app        | custom     | desktop app         |
| **Hermes**         | `hermes`      | `hermes`   | custom     | CLI                 |

### CLI fingerprint sync (Agents + Settings)

`/dashboard/agents` and `Settings > CLI Fingerprint` use `src/shared/constants/cliCompatProviders.ts`.
This keeps provider IDs aligned with CLI cards and legacy IDs.

| CLI ID                                                                                               | Fingerprint Provider ID |
| ---------------------------------------------------------------------------------------------------- | ----------------------- |
| `kilo`                                                                                               | `kilocode`              |
| `copilot`                                                                                            | `github`                |
| `claude` / `codex` / `antigravity` / `kiro` / `cursor` / `cline` / `opencode` / `droid` / `openclaw` | same ID                 |

Legacy IDs still accepted for compatibility: `copilot`, `kimi-coding`, `qwen`.

---

## Step 1 — Get an Routiform API Key

1. Open the Routiform dashboard → **API Manager** (`/dashboard/api-manager`)
2. Click **Create API Key**
3. Give it a name (e.g. `cli-tools`) and select all permissions
4. Copy the key — you'll need it for every CLI below

> Your key looks like: `sk-xxxxxxxxxxxxxxxx-xxxxxxxxx`

---

## Step 2 — Install CLI Tools

All npm-based tools require Node.js 18+:

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

Edit `~/.continue/config.yaml`. `config.json` is deprecated, and the v1 assistant schema
requires `name`, `version` and `schema` at the top level — a file with only `models` is
rejected:

```yaml
name: routiform
version: 0.0.1
schema: v1
models:
  - name: auto
    provider: openai
    model: auto
    apiBase: http://localhost:20128/v1
    apiKey: sk-your-routiform-key
    roles:
      - chat
      - edit
      - apply
```

Each entry is keyed by `name`, not the deprecated `title`. Restart VS Code after editing.

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

### Oh My Pi (omp)

omp splits its config across two files under `~/.omp/agent/`. `models.yml` holds provider blocks and accepts ONLY the `providers` root key — any other root key fails schema validation and makes omp skip the whole file. `config.yml` holds settings, of which `modelRoles.default` selects the model. `PI_CODING_AGENT_DIR` relocates both files.

```bash
mkdir -p ~/.omp/agent && cat > ~/.omp/agent/models.yml << 'EOF'
providers:
  routiform:
    baseUrl: http://localhost:20128/v1
    api: openai-completions
    apiKey: sk-your-routiform-key
    authHeader: true
    models:
      - id: cc/opus
        name: cc/opus
        contextWindow: 200000
        maxTokens: 32000
EOF

cat > ~/.omp/agent/config.yml << 'EOF'
modelRoles:
  default: routiform/cc/opus
EOF
```

`apiKey` resolves as environment-variable-name-or-literal: a value naming an existing env var reads that variable, otherwise the string itself is the key. A `!` prefix would run it as a shell command. `contextWindow` and `maxTokens` must be positive when present; omit them rather than writing 0.

Verify with `omp models routiform`.

Or use the Routiform dashboard → **CLI Tools → Oh My Pi → Save Config** (saves config directly via `/api/cli-tools/guide-settings/omp`).

**Test:** `omp "say hello"`

---

### Kimi Code (kimi)

Kimi Code keeps everything in one TOML file, `~/.kimi-code/config.toml`, which `KIMI_CODE_HOME`
relocates wholesale — the file name inside it is always `config.toml`. A provider declares the
protocol, a model alias declares the window, and root `default_model` picks the alias to start on.

```bash
mkdir -p ~/.kimi-code && cat > ~/.kimi-code/config.toml << 'EOF'
default_model = "routiform/cc/opus"

[providers.routiform]
type = "openai"
base_url = "http://localhost:20128/v1"
api_key = "sk-your-routiform-key"

[models."routiform/cc/opus"]
provider = "routiform"
model = "cc/opus"
max_context_size = 200000
display_name = "cc/opus"
EOF
```

That snippet writes a fresh file. On a config that already exists — `/login` provisions
`[providers."managed:kimi-code"]` there — merge the three blocks in by hand instead, or let
Save Config below do it: a root key such as `default_model` appended after a section header
would be parsed as a key of that section, not of the document.

Kimi Code reads credentials only from this file — `export KIMI_API_KEY` in the shell gives no
provider its key, so `api_key` has to be written here. `max_context_size` is required on every
model entry and must be at least 1; 262144 is the default Kimi applies to a model it defines
itself. An alias containing `/` or `.` must be quoted, hence `[models."routiform/cc/opus"]`.
`max_output_size` is honoured only by the `anthropic` provider type, so it is not written here.

Or use the Routiform dashboard → **CLI Tools → Kimi Code → Save Config** (saves config directly via `/api/cli-tools/guide-settings/kimi`).

**Test:** `kimi -p "say hello"`

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

## Hibaelhárítás

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

# Oh My Pi (omp)
curl -fsSL https://omp.sh/install | sh

# Kimi Code
curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash

# Kiro CLI
apt-get install -y unzip 2>/dev/null; curl -fsSL https://cli.kiro.dev/install | bash

# Write configs
mkdir -p ~/.claude ~/.codex ~/.config/opencode ~/.continue ~/.qwen ~/.omp/agent ~/.kimi-code

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
cat >> ~/.bashrc << EOF
export OPENAI_BASE_URL="$ROUTIFORM_URL"
export OPENAI_API_KEY="$ROUTIFORM_KEY"
export ANTHROPIC_BASE_URL="$ROUTIFORM_URL"
export ANTHROPIC_API_KEY="$ROUTIFORM_KEY"
EOF

source ~/.bashrc
echo "✅ All CLIs installed and configured for Routiform"
```
