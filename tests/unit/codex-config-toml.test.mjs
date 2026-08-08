import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRoutiformCodexConfig,
  hasRoutiformCodexConfig,
  hasUsableCodexAuth,
  removeRoutiformCodexConfig,
} from "../../src/shared/services/codexConfigToml.ts";

test("applyRoutiformCodexConfig preserves unrelated root keys and sections", () => {
  const input = `approval_policy = "never"
sandbox_mode = "workspace-write"

[projects."/tmp/demo"]
trust_level = "trusted"

[model_providers.openai]
name = "OpenAI"
base_url = "https://api.openai.com/v1"
`;

  const output = applyRoutiformCodexConfig(input, {
    model: "cx/gpt-5.4",
    baseUrl: "http://localhost:20128",
  });

  assert.equal(
    output,
    `approval_policy = "never"
sandbox_mode = "workspace-write"
model = "cx/gpt-5.4"
model_provider = "routiform"

[projects."/tmp/demo"]
trust_level = "trusted"

[model_providers.openai]
name = "OpenAI"
base_url = "https://api.openai.com/v1"

[model_providers.routiform]
name = "Routiform"
base_url = "http://localhost:20128/v1"
wire_api = "responses"
`
  );
});

test("applyRoutiformCodexConfig rewrites only the routiform scope", () => {
  const input = `model = "old/model"
model_provider = "routiform"
reasoning_effort = "high"

[model_providers.routiform]
name = "Wrong"
base_url = "http://bad.example"
wire_api = "chat"
extra_field = "keep? no"

[model_providers.other]
name = "Other"
`;

  const output = applyRoutiformCodexConfig(input, {
    model: "cx/gpt-5.4",
    baseUrl: "http://localhost:20128/v1",
  });

  assert.equal(
    output,
    `model = "cx/gpt-5.4"
model_provider = "routiform"
reasoning_effort = "high"

[model_providers.routiform]
name = "Routiform"
base_url = "http://localhost:20128/v1"
wire_api = "responses"
[model_providers.other]
name = "Other"
`
  );
});

test("removeRoutiformCodexConfig removes only routiform keys and section", () => {
  const input = `approval_policy = "never"
model = "cx/gpt-5.4"
model_provider = "routiform"

[projects."/tmp/demo"]
trust_level = "trusted"

[model_providers.routiform]
name = "Routiform"
base_url = "http://localhost:20128/v1"
wire_api = "responses"

[model_providers.openai]
name = "OpenAI"
`;

  const output = removeRoutiformCodexConfig(input);

  assert.equal(
    output,
    `approval_policy = "never"

[projects."/tmp/demo"]
trust_level = "trusted"

[model_providers.openai]
name = "OpenAI"
`
  );
  assert.equal(hasRoutiformCodexConfig(output), false);
});

test("hasUsableCodexAuth accepts local fallback keys and rejects masked values", () => {
  assert.equal(hasUsableCodexAuth('{ "OPENAI_API_KEY": "sk_routiform" }'), true);
  assert.equal(hasUsableCodexAuth('{ "OPENAI_API_KEY": "sk-live-real" }'), true);
  assert.equal(
    hasUsableCodexAuth('{ "auth_mode": "chatgpt", "tokens": { "id_token": "abc" } }'),
    true
  );
  assert.equal(hasUsableCodexAuth('{ "OPENAI_API_KEY": "" }'), false);
  assert.equal(hasUsableCodexAuth('{ "OPENAI_API_KEY": "sk-****" }'), false);
  assert.equal(hasUsableCodexAuth("not-json"), false);
});

test("a known context window is written as a bare TOML integer", () => {
  // Codex only knows the window of its own built-in slugs. Without this key a combo routed
  // through us falls back to Codex's unknown-model metadata and the meter reports 272k.
  const output = applyRoutiformCodexConfig(null, {
    model: "test-combo",
    baseUrl: "http://localhost:20128",
    contextWindow: 200000,
  });

  assert.match(output, /^model_context_window = 200000$/m);
  assert.doesNotMatch(output, /model_context_window = "/, "an i64 key must not be quoted");
});

test("an unknown context window leaves no stale value from the previous model", () => {
  const configured = applyRoutiformCodexConfig(null, {
    model: "big-model",
    baseUrl: "http://localhost:20128",
    contextWindow: 400000,
  });
  const reconfigured = applyRoutiformCodexConfig(configured, {
    model: "unknown-model",
    baseUrl: "http://localhost:20128",
  });

  assert.doesNotMatch(reconfigured, /model_context_window/);
  assert.match(reconfigured, /^model = "unknown-model"$/m);
});

test("re-applying replaces the window rather than stacking a second key", () => {
  let config = applyRoutiformCodexConfig(null, {
    model: "m",
    baseUrl: "http://localhost:20128",
    contextWindow: 128000,
  });
  config = applyRoutiformCodexConfig(config, {
    model: "m",
    baseUrl: "http://localhost:20128",
    contextWindow: 262144,
  });

  assert.equal(config.match(/model_context_window/g).length, 1);
  assert.match(config, /^model_context_window = 262144$/m);
});

test("reset removes the window along with the model it described", () => {
  const configured = applyRoutiformCodexConfig(`approval_policy = "never"\n`, {
    model: "test-combo",
    baseUrl: "http://localhost:20128",
    contextWindow: 300000,
  });

  const reset = removeRoutiformCodexConfig(configured);
  assert.doesNotMatch(reset, /model_context_window/);
  assert.match(reset, /^approval_policy = "never"$/m);
});
