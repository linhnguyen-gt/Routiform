import test from "node:test";
import assert from "node:assert/strict";

/**
 * The product answered "can this model see an image?" two different ways.
 *
 * `/api/models` asked the translator (`modelSupportsImages`), which is the honest answer: vision is
 * a property of the model reached through a specific provider, because the request translator on
 * the way out is what does or does not carry the image.
 *
 * `/v1/models` asked a 33-substring keyword list against the model id — including a bare "gemini"
 * and a bare "vision". So `cursor/gpt-4o` was advertised as vision-capable to every `/v1` client
 * while the cursor translator returns text only and the image vanished with no marker.
 *
 * Both now read the same function. This file is the assertion that they cannot drift again.
 */

const { getVisionCapabilityFields } = await import("../../src/app/api/v1/models/catalog.ts");
const { modelSupportsImages } = await import("../../open-sse/translator/model-image-support.ts");

// Spans both sides of the image-support matrix, and both spellings of a provider (id and alias).
const PAIRS = [
  // carries
  ["openai", "gpt-4o"],
  ["claude", "claude-sonnet-4.5"],
  ["gemini", "gemini-2.5-pro"],
  ["kiro", "claude-sonnet-4.5"],
  ["antigravity", "gemini-3-pro"],
  // drops — the translator discards or placeholder-substitutes the image
  ["cursor", "gpt-4o"],
  ["devin", "claude-sonnet-4.5"],
  ["commandcode", "claude-sonnet-4.5"],
  // a model whose id contains no vision keyword at all, on a carrying provider
  ["openai", "some-unlisted-model"],
  // a model whose id screams vision, on a dropping provider — the pair that disagreed
  ["cursor", "gpt-4-vision-preview"],
  ["devin", "gemini-2.5-pro-vision"],
];

for (const [provider, model] of PAIRS) {
  test(`/v1/models and /api/models agree on ${provider}/${model}`, () => {
    const v1Vision = getVisionCapabilityFields(provider, model) !== null;
    const apiVision = modelSupportsImages(provider, model);
    assert.equal(
      v1Vision,
      apiVision,
      `/v1/models says ${v1Vision}, /api/models says ${apiVision} for ${provider}/${model}`
    );
  });
}

test("a vision-named model on an image-dropping provider is NOT advertised as vision", () => {
  // Under the old keyword list every one of these was `vision: true`, because the check never
  // looked at the provider.
  for (const [provider, model] of [
    ["cursor", "gpt-4o"],
    ["cursor", "gpt-4-vision-preview"],
    ["devin", "gemini-2.5-pro"],
    ["commandcode", "claude-sonnet-4.5"],
  ]) {
    assert.equal(
      getVisionCapabilityFields(provider, model),
      null,
      `${provider}/${model} discards images in translation and must not claim vision`
    );
  }
});

test("a carrying provider still emits the full vision field set", () => {
  const fields = getVisionCapabilityFields("openai", "gpt-4o");
  assert.deepEqual(fields, {
    capabilities: { vision: true },
    supports_vision: true,
    supports_image_input: true,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    modalities: { input: ["text", "image"], output: ["text"] },
  });
});

test("a missing provider or model yields no vision claim rather than a throw", () => {
  assert.equal(getVisionCapabilityFields("", "gpt-4o"), null);
  assert.equal(getVisionCapabilityFields("openai", ""), null);
  assert.equal(getVisionCapabilityFields(undefined, undefined), null);
});
