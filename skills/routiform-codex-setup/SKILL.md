---
name: routiform-codex-setup
description: "Point the OpenAI Codex CLI at a running Routiform gateway by adding a model_providers entry to ~/.codex/config.toml, so codex requests route through Routiform's /v1/responses surface with failover and logging. Use when someone asks to connect Codex CLI to Routiform, run codex against a self-hosted gateway or proxy, or use non-OpenAI models from Codex."
---

# Connect OpenAI Codex CLI to Routiform

Codex reads providers from `~/.codex/config.toml`. Routiform serves the Responses API at
`/v1/responses`, which is the wire protocol Codex expects.

## Prerequisites

- Routiform running and reachable. Default: `http://localhost:20128`. Confirm with
  `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:20128/v1/models` → `200`.
- At least one provider connection configured at `/dashboard/providers`.
- Codex installed: `npm install -g @openai/codex`.

## Steps

**1. Create a gateway API key** — Routiform's own, not a provider key. Dashboard → API Manager, or:

```bash
routiform key create codex
```

**2. Add the provider to `~/.codex/config.toml`.** This is the exact block Routiform's own CLI Tools
page writes, so it stays compatible with the dashboard's detect-and-apply flow:

```toml
model = "openai/gpt-5"
model_provider = "routiform"

[model_providers.routiform]
name = "Routiform"
base_url = "http://localhost:20128/v1"
wire_api = "responses"
```

`base_url` **does** carry `/v1` here — unlike Claude Code, Codex appends only the endpoint path.

**3. Give Codex the key.** With no `env_key` in the provider block, Codex reads `OPENAI_API_KEY`:

```bash
export OPENAI_API_KEY="sk-your-routiform-key"
```

**4. Pick a model that exists.** `model` must be an id Routiform can resolve — list them with
`curl -H "Authorization: Bearer $OPENAI_API_KEY" http://localhost:20128/v1/models`, or point it at a
combo. A bare `auto` is rejected: Routiform answers
`Ambiguous model 'auto'. Use provider/model prefix (ex: qd/auto or kr/auto)`.

For a remote Routiform, replace `localhost:20128` with the host and use `https://`.

## Verify

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai/gpt-5","input":"ping"}' \
  http://localhost:20128/v1/responses
```

`200` means the surface Codex uses is working end to end. Then run `codex "what is 2+2?"` and check
`/dashboard/logs` — the entry appearing there is the proof it routed through Routiform rather than
straight to OpenAI.

## If it fails

| Symptom                                 | Cause                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `400 Ambiguous model 'auto'`            | `model` needs a provider prefix or a real id.                                   |
| `400 No credentials for provider: <id>` | Routing resolved to a provider with no connection configured.                   |
| `401`                                   | `OPENAI_API_KEY` is not the Routiform key, or the key was revoked.              |
| Codex still calls api.openai.com        | `model_provider` is not set to `routiform`, or a second config file is winning. |
| Connection refused                      | Routiform is not running, or is on another port. Check `routiform status`.      |

To undo, delete the `[model_providers.routiform]` section and the `model_provider` line, or use the
dashboard's CLI Tools page, which removes exactly those keys.
