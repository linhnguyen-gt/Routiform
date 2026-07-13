/**
 * Proves the image-support matrix against the REAL translators.
 *
 * This drives translateRequest with an actual OpenAI image_url part and inspects
 * what comes out the other side. It does not assert that a constant equals itself —
 * a table that only agrees with its own comment is worthless, and this is exactly
 * the trap documented in docs/CODEBASE_DOCUMENTATION.md §9.
 *
 * If a translator starts or stops carrying images, this fails and the matrix in
 * open-sse/translator/image-support.ts has to be updated to match reality.
 */

import test from "node:test";
import assert from "node:assert/strict";

const { translateRequest } = await import("../../open-sse/translator/index.ts");
const { getImageSupportMatrix, formatCarriesImages } =
  await import("../../open-sse/translator/image-support.ts");

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** An OpenAI-shaped request carrying one image. This is what the chat sends. */
function imageRequest() {
  return {
    model: "test-model",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "What is in this image?" },
          { type: "image_url", image_url: { url: PNG_DATA_URL } },
        ],
      },
    ],
  };
}

/**
 * True if the base64 payload survived anywhere in the translated body.
 *
 * Deliberately crude: it does not care WHERE the image ended up (inlineData,
 * source.data, images[]), only whether the bytes reached the provider at all.
 * That is the property the UI gates on.
 */
function imageSurvived(translated) {
  const marker = PNG_DATA_URL.split(",")[1].slice(0, 24);
  return JSON.stringify(translated ?? {}).includes(marker);
}

const matrix = getImageSupportMatrix();

test("image-support: the harness actually drives the translator", () => {
  // Guard the guard. translateRequest takes (sourceFormat, targetFormat, model, body)
  // — get that order wrong and every "drops" assertion passes against an empty body,
  // which reads as a green suite that proves nothing. This pins the one case whose
  // answer cannot be in doubt: openai -> openai is passthrough, so the image MUST
  // survive. If this fails, the assertions below are meaningless, not the matrix.
  const translated = translateRequest("openai", "openai", "test-model", imageRequest());
  assert.ok(
    imageSurvived(translated),
    "openai -> openai is a passthrough; if the image did not survive, the harness is " +
      "calling translateRequest wrong and no other test in this file means anything."
  );
});

for (const [format, expected] of Object.entries(matrix)) {
  test(`image-support: ${format} really ${expected} images`, () => {
    let translated;
    try {
      translated = translateRequest("openai", format, "test-model", imageRequest());
    } catch (err) {
      assert.fail(
        `translateRequest(openai -> ${format}) threw: ${err.message}. ` +
          `The matrix claims "${expected}" but the translator cannot be driven at all.`
      );
    }

    const survived = imageSurvived(translated);

    if (expected === "carries") {
      assert.ok(
        survived,
        `Matrix says ${format} CARRIES images, but the base64 payload did not reach the ` +
          `translated body. Either the translator regressed or the matrix is wrong — do not ` +
          `"fix" this by changing the matrix without reading the translator.`
      );
    } else {
      assert.ok(
        !survived,
        `Matrix says ${format} DROPS images, but the payload survived. If the translator ` +
          `learned to carry images, update image-support.ts — the UI is needlessly blocking it.`
      );
    }
  });
}

test("image-support: kiro carries an image on the turn it was attached, not one turn late", () => {
  // Regression. openai-to-kiro.ts rebuilds currentMessage.userInputMessage field by field
  // instead of spreading it, so `images` was dropped from the current turn while the SAME
  // image survived once it aged into history. The user-visible symptom was an image the
  // model could not see until the turn after they sent it.
  const img = { type: "image_url", image_url: { url: PNG_DATA_URL } };

  const currentTurn = translateRequest("openai", "kiro", "m", {
    model: "m",
    messages: [{ role: "user", content: [{ type: "text", text: "see this" }, img] }],
  });
  assert.ok(
    imageSurvived(currentTurn),
    "an image attached to the message being sent must reach the provider on that turn"
  );

  const historyTurn = translateRequest("openai", "kiro", "m", {
    model: "m",
    messages: [
      { role: "user", content: [{ type: "text", text: "see this" }, img] },
      { role: "assistant", content: "ok" },
      { role: "user", content: [{ type: "text", text: "now describe it" }] },
    ],
  });
  assert.ok(imageSurvived(historyTurn), "an image in an earlier turn must stay in history");
});

test("image-support: formatCarriesImages defaults unknown formats to false", () => {
  // A new translator must opt in. Guessing "carries" wrong is silent: the user
  // attaches a screenshot and the model answers about nothing.
  assert.equal(formatCarriesImages("some-future-format"), false);
  assert.equal(formatCarriesImages(undefined), false);
  assert.equal(formatCarriesImages(null), false);
  assert.equal(formatCarriesImages(""), false);
});

test("image-support: the matrix covers every format a real provider resolves to", async () => {
  // Enumerate from the PROVIDERS, not from the FORMATS constants.
  //
  // getTargetFormat can return a bare `format` string straight from the provider registry,
  // which need not be a FORMATS member at all — kilocode resolves to "openrouter". A version
  // of this test that walked FORMATS passed while openrouter was unclassified, which silently
  // disabled image attach for it. Start from what actually routes.
  const { getTargetFormat } = await import("../../open-sse/services/provider.ts");
  const { PROVIDER_ID_TO_ALIAS } = await import("../../open-sse/config/providerModels.ts");

  const missing = [];
  for (const providerId of Object.keys(PROVIDER_ID_TO_ALIAS)) {
    const format = getTargetFormat(providerId);
    if (!(format in matrix)) missing.push(`${providerId} -> ${format}`);
  }

  assert.deepEqual(
    missing,
    [],
    `These providers resolve to a target format with no image-support entry, so image attach ` +
      `is silently disabled for them: ${missing.join(", ")}`
  );
});
