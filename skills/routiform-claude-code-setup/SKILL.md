---
name: routiform-claude-code-setup
description: "Point Claude Code at a running Routiform gateway so every claude request routes through it — provider failover, combos, and usage logging included. Covers creating a gateway API key, setting ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN, and verifying the round trip. Use when someone asks to connect Claude Code to Routiform, route Claude Code through a proxy or gateway, or share one Anthropic key across providers."
---

# Connect Claude Code to Routiform

Claude Code talks the Anthropic Messages API. Routiform serves that API at `/v1/messages`, so
Claude Code needs no plugin — only a base URL and a token.

## Prerequisites

- Routiform running and reachable. Default: `http://localhost:20128`. Confirm with
  `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:20128/v1/models` → `200`.
- At least one provider connection configured at `/dashboard/providers`. Without one, requests reach
  the gateway and fail with `No credentials for provider: <id>`.
- Claude Code installed: `npm install -g @anthropic-ai/claude-code`.

## Steps

**1. Create a gateway API key.** This is Routiform's own key, not a provider key. Dashboard →
API Manager → create, or:

```bash
routiform key create claude-code
```

Copy the `sk-...` value. It is shown once.

**2. Point Claude Code at Routiform.** Both variables are required — the token is what Routiform
authenticates, and Claude Code will otherwise try to use a stored Anthropic login.

```bash
export ANTHROPIC_BASE_URL="http://localhost:20128"
export ANTHROPIC_AUTH_TOKEN="sk-your-routiform-key"
```

Add them to `~/.zshrc` or `~/.bashrc` to survive a new shell. To scope it to Claude Code alone, put
them in `~/.claude/settings.json` instead:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:20128",
    "ANTHROPIC_AUTH_TOKEN": "sk-your-routiform-key"
  }
}
```

Leave `/v1` off `ANTHROPIC_BASE_URL` — Claude Code appends `/v1/messages` itself, which is why the
dashboard's own CLI Tools page writes the bare origin. Routiform happens to answer the doubled
`/v1/v1/messages` too, so a base URL ending in `/v1` will not break; it is just wrong on paper and
will confuse the next person reading your shell profile.

**3. Choose what serves the request.** Routiform maps the incoming Claude model name onto whatever
you configured. To pin a specific one, set `ANTHROPIC_MODEL` to an id from
`GET /v1/models`, or build a combo at `/dashboard/combos` and let Routiform pick.

For a remote Routiform, replace `localhost:20128` with the host and use `https://` — the token
travels in a header.

## Verify

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-5","max_tokens":16,"messages":[{"role":"user","content":"ping"}]}' \
  "$ANTHROPIC_BASE_URL/v1/messages"
```

`200` means the whole path works. Then run `claude "say hello"` and check
`/dashboard/logs` — the request appears there, which is the actual proof it went through Routiform
rather than straight to Anthropic.

## If it fails

| Symptom                                 | Cause                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| `400 No credentials for provider: <id>` | Routing resolved to a provider with no connection. Add one, or pin a model you have. |
| `400 Missing model`                     | The request body never reached Routiform intact — usually a proxy in between.        |
| `401`                                   | The key is wrong, revoked, or from a different Routiform instance.                   |
| Claude Code ignores the setting         | A stale login takes precedence — run `claude logout`, then retry.                    |
| Connection refused                      | Routiform is not running, or is on another port. Check `routiform status`.           |
