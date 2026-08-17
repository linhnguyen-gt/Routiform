/**
 * An array-of-tables header is a header.
 *
 * `[[hooks]]` opens a table just like `[hooks]` does, so every key after it belongs to that
 * entry until the next header. Treating it as an ordinary line cost two things on a real
 * config: a root key appended at EOF was parsed as a key of the last hook — Kimi Code
 * rejected the whole file with `hooks[14]: Unrecognized key` — and a managed section whose
 * range ran to the next *recognised* header swallowed the user's `[[hooks]]` on reset.
 *
 * Codex configs take `[[...]]` blocks too, and share these primitives.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { applyRoutiformKimiConfig, removeRoutiformKimiConfig } =
  await import("../../src/shared/services/kimiConfigToml.ts");

const INPUT = { baseUrl: "http://localhost:20128", apiKey: "sk_test", model: "agents-combo" };

/** The shape that broke: comments, then nothing but array-of-tables entries. */
const HOOKS_ONLY = `# ~/.kimi-code/config.toml
# This file starts empty so built-in defaults can apply.

# >>> agentkit hooks (managed by agentkit — edits here are overwritten)

[[hooks]]
event = "SessionStart"
command = "node hook.cjs sessionstart"
timeout = 30

[[hooks]]
event = "SubagentStart"
command = "node team-context-inject.cjs"
timeout = 30

# <<< agentkit hooks
`;

const lineIndexOf = (config, predicate) => config.split("\n").findIndex(predicate);

test("a root key is never written after an array-of-tables header", () => {
  const config = applyRoutiformKimiConfig(HOOKS_ONLY, INPUT);

  const defaultModel = lineIndexOf(config, (line) => line.startsWith("default_model"));
  const firstHook = lineIndexOf(config, (line) => line.trim() === "[[hooks]]");

  assert.ok(defaultModel >= 0, "default_model was not written at all");
  assert.ok(
    defaultModel < firstHook,
    `default_model landed at line ${defaultModel}, after the [[hooks]] header at ${firstHook} — ` +
      `TOML reads it as a key of that hook, and Kimi Code rejects the file`
  );
});

test("a root key is not written inside a block another tool declares it manages", () => {
  const config = applyRoutiformKimiConfig(HOOKS_ONLY, INPUT);

  const defaultModel = lineIndexOf(config, (line) => line.startsWith("default_model"));
  const managedBlock = lineIndexOf(config, (line) => line.includes(">>> agentkit hooks"));

  assert.ok(
    defaultModel < managedBlock,
    `default_model landed inside the agentkit-managed block, which that tool overwrites`
  );
});

test("both hooks survive a save", () => {
  const config = applyRoutiformKimiConfig(HOOKS_ONLY, INPUT);

  assert.equal(config.match(/^\[\[hooks]]$/gm).length, 2);
  assert.match(config, /command = "node team-context-inject\.cjs"/);
});

test("reset does not swallow the array-of-tables that follow a managed section", () => {
  // Hooks after the Routiform sections is the ordering that made the range overrun visible.
  const saved = `${applyRoutiformKimiConfig("", INPUT)}
[[hooks]]
event = "SessionStart"
command = "node hook.cjs"
timeout = 30
`;

  const reset = removeRoutiformKimiConfig(saved);

  assert.doesNotMatch(reset, /routiform/);
  assert.match(reset, /\[\[hooks]]/);
  assert.match(reset, /command = "node hook\.cjs"/);
});

/** What a config written by the broken version looks like on disk. */
const STRANDED = `${HOOKS_ONLY}default_model = "routiform/agents-combo"

[providers.routiform]
type = "openai"
base_url = "http://localhost:20128/v1"
api_key = "sk_old"

[models."routiform/agents-combo"]
provider = "routiform"
model = "agents-combo"
max_context_size = 262144
`;

test("saving over a config the broken version wrote leaves exactly one default_model", () => {
  const config = applyRoutiformKimiConfig(STRANDED, INPUT);

  const occurrences = config.match(/^\s*default_model\s*=/gm) || [];
  assert.equal(occurrences.length, 1, `found ${occurrences.length} default_model lines`);

  const defaultModel = lineIndexOf(config, (line) => line.startsWith("default_model"));
  const firstHook = lineIndexOf(config, (line) => line.trim() === "[[hooks]]");
  assert.ok(defaultModel < firstHook, "the surviving one is still stranded inside a table");
});

test("reset clears a default_model the broken version stranded inside a table", () => {
  const reset = removeRoutiformKimiConfig(STRANDED);

  assert.doesNotMatch(reset, /default_model/);
  assert.equal(reset.match(/^\[\[hooks]]$/gm).length, 2);
});

test("a default_model the user points at their own provider is never stripped", () => {
  const mine = `default_model = "kimi-code/k3"

[[hooks]]
event = "Stop"
`;

  assert.match(removeRoutiformKimiConfig(mine), /default_model = "kimi-code\/k3"/);
});

test("an array-of-tables named like a managed section is not mistaken for it", () => {
  const withArray = `[[providers.routiform]]
event = "not a table"
`;

  // `[[providers.routiform]]` is a different construct from `[providers.routiform]`;
  // removing the table must not touch the array entry.
  assert.match(removeRoutiformKimiConfig(withArray), /\[\[providers\.routiform]]/);
});
