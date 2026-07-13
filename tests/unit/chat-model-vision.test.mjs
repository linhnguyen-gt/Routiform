/**
 * The vision flag the composer gates image attach on.
 *
 * The bug this exists to prevent is silent: a model that cannot receive an image still
 * answers, confidently, about nothing. So these drive the real provider registry rather
 * than a hand-built table.
 */

import test from "node:test";
import assert from "node:assert/strict";

const { modelSupportsImages, resolveTargetFormat } =
  await import("../../src/lib/chat/model-vision.ts");
const { PROVIDER_ID_TO_ALIAS } = await import("../../open-sse/config/providerModels.ts");
const { getImageSupportMatrix } = await import("../../open-sse/translator/image-support.ts");

test("model-vision: the three image-dropping providers are flagged as such", () => {
  // cursor drops images silently; devin and commandcode substitute the literal string
  // "[image omitted]", which is worse — the model is told an image existed, then denied it.
  assert.equal(modelSupportsImages("cursor", "gpt-4o"), false);
  assert.equal(modelSupportsImages("devin", "claude-sonnet-4.5"), false);
  assert.equal(modelSupportsImages("commandcode", "claude-sonnet-4.5"), false);
});

test("model-vision: providers whose translators carry images are flagged as such", () => {
  assert.equal(modelSupportsImages("claude", "claude-sonnet-4.5"), true);
  assert.equal(modelSupportsImages("gemini", "gemini-2.5-pro"), true);
  assert.equal(modelSupportsImages("kiro", "claude-sonnet-4.5"), true);
  assert.equal(modelSupportsImages("openai", "gpt-4o"), true);
});

test("model-vision: provider id and alias resolve identically", () => {
  // /api/models emits aliases ("cc", "kr"), the request path resolves ids ("claude", "kiro").
  // If those ever diverged, the UI would enable attachments on a path that drops them.
  for (const [providerId, alias] of Object.entries(PROVIDER_ID_TO_ALIAS)) {
    assert.equal(
      modelSupportsImages(providerId, "some-model"),
      modelSupportsImages(alias, "some-model"),
      `provider "${providerId}" and its alias "${alias}" disagree on image support`
    );
  }
});

test("model-vision: every provider resolves to a format the matrix classifies", () => {
  // A provider resolving to an unclassified format is treated as image-dropping, which is the
  // safe default but silently disables attachments. Surface it here instead.
  const matrix = getImageSupportMatrix();
  const unclassified = [];

  for (const providerId of Object.keys(PROVIDER_ID_TO_ALIAS)) {
    const format = resolveTargetFormat(providerId, "some-model");
    if (!(format in matrix)) unclassified.push(`${providerId} -> ${format}`);
  }

  assert.deepEqual(
    unclassified,
    [],
    `These providers resolve to a target format with no image-support entry, so image attach ` +
      `is disabled for them by default: ${unclassified.join(", ")}`
  );
});

test("model-vision: a missing provider does not throw and does not claim vision", () => {
  assert.equal(modelSupportsImages("", "gpt-4o"), false, "no provider means no route, no vision");

  // An unrecognized provider is a different case: getTargetFormat falls back to "openai", so
  // the router WOULD send it as an OpenAI body and the image would survive. Report what the
  // router actually does rather than inventing a safer-sounding answer — and note that such a
  // model cannot reach the picker anyway, since the catalog only emits registered providers.
  assert.equal(resolveTargetFormat("no-such-provider", "gpt-4o"), "openai");
  assert.equal(modelSupportsImages("no-such-provider", "gpt-4o"), true);
});
