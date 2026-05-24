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
