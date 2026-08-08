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

test("parseTitleGeneration reports what the dashboard should prefill", () => {
  assert.equal(parseTitleGeneration(MODEL_BLOCK), null);

  const yaml = upsertTitleGenerationBlock(MODEL_BLOCK, { model: "aux", baseUrl: BASE_URL });
  assert.deepEqual(parseTitleGeneration(yaml), {
    enabled: true,
    provider: "custom",
    model: "aux",
  });
});
