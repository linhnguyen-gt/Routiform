/**
 * Hermes ~/.hermes/config.yaml edits.
 *
 * Two things have to hold. The model block must name the key it expects, because Hermes
 * documents `api_key` as part of a `provider: custom` route and the `.env` file alone is a
 * fallback. And the auxiliary block must be edited one task deep: `vision`, `compression`
 * and the rest belong to the user, and replacing the whole `auxiliary:` block would erase
 * them the first time a session-title model is picked.
 */
import test from "node:test";
import assert from "node:assert/strict";

const {
  HERMES_API_KEY_ENV,
  buildModelBlock,
  hasRoutiformHermesConfig,
  parseModelBlock,
  parseTitleGeneration,
  removeAuxiliaryOverrides,
  removeModelBlock,
  upsertModelBlock,
  upsertTitleGenerationBlock,
} = await import("../../src/shared/services/hermesConfigYaml.ts");

const { load: loadYaml } = await import("js-yaml");

const BASE_URL = "http://127.0.0.1:20128/v1";
const MODEL_BLOCK = buildModelBlock("cx/gpt-5.4", BASE_URL);

test("the model block names the env var Hermes reads for a custom provider", () => {
  assert.match(MODEL_BLOCK, /api_key: "\$\{OPENAI_API_KEY\}"/);
  assert.equal(HERMES_API_KEY_ENV, "OPENAI_API_KEY");
});

test("the model block still parses back to the fields the dashboard shows", () => {
  const parsed = parseModelBlock(MODEL_BLOCK);
  assert.equal(parsed.default, "cx/gpt-5.4");
  assert.equal(parsed.provider, "custom");
  assert.equal(parsed.base_url, BASE_URL);
});

test("a title model is written as a custom auxiliary route", () => {
  const yaml = upsertTitleGenerationBlock(MODEL_BLOCK, {
    model: "cc/claude-haiku-4-5",
    baseUrl: BASE_URL,
  });
  const { auxiliary } = loadYaml(yaml);

  assert.equal(auxiliary.title_generation.provider, "custom");
  assert.equal(auxiliary.title_generation.model, "cc/claude-haiku-4-5");
  assert.equal(auxiliary.title_generation.base_url, BASE_URL);
  assert.equal(auxiliary.title_generation.enabled, true);
});

test("the model block survives an auxiliary edit", () => {
  const yaml = upsertTitleGenerationBlock(MODEL_BLOCK, { model: "aux", baseUrl: BASE_URL });
  assert.equal(parseModelBlock(yaml).default, "cx/gpt-5.4");
});

test("the user's other auxiliary tasks are left alone", () => {
  const existing = `${MODEL_BLOCK}
auxiliary:
  vision:
    provider: "openrouter"
    model: "google/gemini-2.5-flash"
    timeout: 120
  title_generation:
    provider: "auto"
    model: ""
`;
  const yaml = upsertTitleGenerationBlock(existing, { model: "aux", baseUrl: BASE_URL });
  const { auxiliary } = loadYaml(yaml);

  assert.equal(auxiliary.vision.provider, "openrouter");
  assert.equal(auxiliary.vision.timeout, 120);
  assert.equal(auxiliary.title_generation.model, "aux");
});

test("an explicit `enabled: false` is not silently turned back on", () => {
  const existing = `${MODEL_BLOCK}
auxiliary:
  title_generation:
    enabled: false
`;
  const yaml = upsertTitleGenerationBlock(existing, { model: "aux", baseUrl: BASE_URL });
  assert.equal(loadYaml(yaml).auxiliary.title_generation.enabled, false);
});

test("clearing the field returns the task to the main model", () => {
  const configured = upsertTitleGenerationBlock(MODEL_BLOCK, {
    model: "aux",
    baseUrl: BASE_URL,
  });
  const cleared = upsertTitleGenerationBlock(configured, null);
  const { auxiliary } = loadYaml(cleared);

  assert.equal(auxiliary.title_generation.provider, "auto");
  assert.equal(auxiliary.title_generation.model, "");
});

test("clearing a config that never had an override changes nothing", () => {
  assert.equal(upsertTitleGenerationBlock(MODEL_BLOCK, null), MODEL_BLOCK);
});

test("reset strips the model block and the override together", () => {
  const configured = upsertTitleGenerationBlock(MODEL_BLOCK, {
    model: "aux",
    baseUrl: BASE_URL,
  });
  const reset = removeAuxiliaryOverrides(removeModelBlock(configured));

  assert.equal(parseModelBlock(reset), null);
  assert.equal(loadYaml(reset).auxiliary.title_generation.provider, "auto");
});

test("an unrelated top-level block is never disturbed", () => {
  const existing = `terminal:\n  shell: "zsh"\n`;
  const yaml = upsertTitleGenerationBlock(upsertModelBlock(existing, MODEL_BLOCK), {
    model: "aux",
    baseUrl: BASE_URL,
  });
  assert.equal(loadYaml(yaml).terminal.shell, "zsh");
});

test("a config Hermes is already running is recognised as configured", () => {
  // The shape a real ~/.hermes/config.yaml has after an apply: our block on top, Hermes' own
  // blocks below it. Reading this back is what tells a reloaded card the tool is set up.
  const real = `${MODEL_BLOCK}
database:
  path: "~/.hermes/hermes.db"
agent:
  max_iterations: 50
`;
  assert.equal(hasRoutiformHermesConfig(real), true);
});

test("a config pointed somewhere else is not claimed as ours", () => {
  assert.equal(hasRoutiformHermesConfig(""), false);
  assert.equal(hasRoutiformHermesConfig('model:\n  provider: "openrouter"\n'), false);
  assert.equal(
    hasRoutiformHermesConfig(buildModelBlock("gpt-5.4", "https://api.openai.com/v1")),
    false
  );
});

test("parseTitleGeneration reports what the dashboard should prefill", () => {
  assert.equal(parseTitleGeneration(MODEL_BLOCK), null);

  const yaml = upsertTitleGenerationBlock(MODEL_BLOCK, { model: "aux", baseUrl: BASE_URL });
  assert.deepEqual(parseTitleGeneration(yaml), {
    enabled: true,
    provider: "custom",
    model: "aux",
  });
});

test("an explicit context window is written, because Hermes cannot detect ours", () => {
  // Hermes classifies a local endpoint by probing /api/v1/models and reading 200 as
  // "LM Studio". This app answers that path, so detection dead-ends on a shape a proxy
  // does not have. `context_length` is step 0 of Hermes' resolution chain — ahead of both
  // its cached misclassification and the probe.
  const block = buildModelBlock("test-combo", BASE_URL, 300000);

  assert.match(block, /^ {2}context_length: 300000$/m);
  assert.equal(parseModelBlock(block).context_length, 300000);
});

test("an unknown window writes no key rather than a zero", () => {
  assert.doesNotMatch(buildModelBlock("m", BASE_URL), /context_length/);
  assert.doesNotMatch(buildModelBlock("m", BASE_URL, 0), /context_length/);
  assert.equal(parseModelBlock(MODEL_BLOCK).context_length, null);
});

test("re-applying replaces the window instead of leaving the previous model's", () => {
  const first = upsertModelBlock("", buildModelBlock("big", BASE_URL, 400000));
  const second = upsertModelBlock(first, buildModelBlock("small", BASE_URL, 128000));

  assert.equal(second.match(/context_length/g).length, 1);
  assert.equal(parseModelBlock(second).context_length, 128000);
});

test("the window survives a title-model edit", () => {
  const yaml = upsertTitleGenerationBlock(buildModelBlock("m", BASE_URL, 262144), {
    model: "aux",
    baseUrl: BASE_URL,
  });
  assert.equal(parseModelBlock(yaml).context_length, 262144);
});
