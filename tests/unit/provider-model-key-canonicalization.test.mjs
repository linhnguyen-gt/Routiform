/**
 * Regression: model-level settings are keyed by `provider/model`, but the provider
 * segment was written in whichever spelling the calling surface used — model pickers
 * emit the alias (`ds/deepseek-reasoner`), the registry and the settings form use the
 * id (`deepseek/deepseek-reasoner`). The same model therefore held two independent
 * entries, so an effort set from one surface read as unset from the other and the
 * built-in default it was meant to override stayed visible.
 */

import test from "node:test";
import assert from "node:assert/strict";

const { canonicalizeProviderModelKey, rekeyProviderModelMap, toPickerProviderModelKey } =
  await import("../../src/shared/models/model-string.ts");

test("an alias-spelled key canonicalizes to the provider id", () => {
  assert.equal(canonicalizeProviderModelKey("ds/deepseek-reasoner"), "deepseek/deepseek-reasoner");
  assert.equal(canonicalizeProviderModelKey("gh/gpt-5.3-codex"), "github/gpt-5.3-codex");
});

test("a key already spelled with the provider id is left alone", () => {
  assert.equal(canonicalizeProviderModelKey("deepseek/deepseek-chat"), "deepseek/deepseek-chat");
});

test("canonicalization keeps the whole remainder, slashes and casing included", () => {
  assert.equal(
    canonicalizeProviderModelKey("di/deepseek-ai/DeepSeek-V3"),
    "deepinfra/deepseek-ai/DeepSeek-V3"
  );
});

test("references outside the registry and slash-less values pass through", () => {
  assert.equal(
    canonicalizeProviderModelKey("my-custom-node/some-model"),
    "my-custom-node/some-model"
  );
  assert.equal(canonicalizeProviderModelKey("just-a-combo-name"), "just-a-combo-name");
});

test("the picker spelling is the exact inverse for registry providers", () => {
  const canonical = canonicalizeProviderModelKey("ds/deepseek-reasoner");
  assert.equal(toPickerProviderModelKey(canonical), "ds/deepseek-reasoner");
});

test("both spellings of one model collapse onto a single entry", () => {
  const collapsed = rekeyProviderModelMap(
    { "ds/deepseek-reasoner": "high", "deepseek/deepseek-chat": "low" },
    canonicalizeProviderModelKey
  );
  assert.deepEqual(collapsed, {
    "deepseek/deepseek-reasoner": "high",
    "deepseek/deepseek-chat": "low",
  });
});

/**
 * The stored map is canonical-spelled and is merged UNDER the client's edits, which are
 * picker-spelled. Collapsing has to let the later entry win — preferring the canonical
 * spelling would drop every edit to a model that already has a stored default, while
 * still reporting success.
 */
test("an edit in picker spelling overrides the stored canonical entry", () => {
  const stored = { "deepseek/deepseek-reasoner": "low" };
  const edits = { "ds/deepseek-reasoner": "max" };
  const merged = rekeyProviderModelMap({ ...stored, ...edits }, canonicalizeProviderModelKey);
  assert.deepEqual(merged, { "deepseek/deepseek-reasoner": "max" });
});
