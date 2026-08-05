# Routiform skills for coding agents

Task-shaped setup guides an agent can read and follow on its own. Each file is one job — point one
tool at a running Routiform — with prerequisites, exact commands, and a verification step that fails
loudly if the setup is wrong.

## Use one

Paste the raw URL into whatever agent you are using and tell it to follow the file:

```text
Follow https://raw.githubusercontent.com/linhnguyen-gt/Routiform/main/skills/routiform-claude-code-setup/SKILL.md
```

Or fetch it locally:

```bash
curl -O https://raw.githubusercontent.com/linhnguyen-gt/Routiform/main/skills/routiform-codex-setup/SKILL.md
```

Claude Code users can drop a directory into `~/.claude/skills/` and invoke it by name instead.

## Available

| Skill                                                                 | Task                                                              |
| --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [`routiform-claude-code-setup`](routiform-claude-code-setup/SKILL.md) | Point Claude Code at Routiform's Anthropic-compatible surface     |
| [`routiform-codex-setup`](routiform-codex-setup/SKILL.md)             | Point OpenAI Codex CLI at Routiform via a `model_providers` entry |
| [`routiform-cursor-setup`](routiform-cursor-setup/SKILL.md)           | Point Cursor at Routiform through its OpenAI base-URL override    |

Every one of them assumes Routiform is already running and at least one provider connection is
configured. `docs/CLI-TOOLS.md` covers the full CLI matrix — these three are the highest-traffic
paths, kept short enough that an agent follows them without improvising.

## This is not the product's skills feature

Routiform _also_ has a skills system inside the product — an agent-facing store with its own table
and API (`src/lib/a2a/skills`, `src/lib/db/migrations/016_create_skills.sql`), surfaced over A2A and
MCP for routing behaviour. That is runtime code operating on data an operator manages through the
dashboard.

This directory is neither. It is distribution material: markdown that external agents read to
configure a client. Nothing here is loaded by the server, imported by the application, or exposed
over any endpoint.
