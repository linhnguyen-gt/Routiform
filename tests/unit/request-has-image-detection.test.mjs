import test from "node:test";
import assert from "node:assert/strict";

/**
 * The combo pre-flight only reorders when the CURRENT user turn carries an image. An image several
 * turns back has already been answered about; reordering for it would cost a full-history scan on
 * every request to change routing for a turn that is not about the image.
 */

const { requestHasImage } = await import("../../open-sse/services/request-has-image.ts");

const DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

test("OpenAI chat: image_url in the current user turn", () => {
  assert.equal(
    requestHasImage({
      messages: [
        { role: "system", content: "be helpful" },
        {
          role: "user",
          content: [
            { type: "text", text: "what is this?" },
            { type: "image_url", image_url: { url: DATA_URL } },
          ],
        },
      ],
    }),
    true
  );
});

test("Claude messages: an image block in the current user turn", () => {
  assert.equal(
    requestHasImage({
      system: "be helpful",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "what is this?" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } },
          ],
        },
      ],
    }),
    true
  );
});

test("Gemini: inlineData with an image mime in the current user turn", () => {
  assert.equal(
    requestHasImage({
      contents: [
        { role: "user", parts: [{ text: "earlier" }] },
        { role: "model", parts: [{ text: "ok" }] },
        {
          role: "user",
          parts: [{ text: "and this?" }, { inlineData: { mimeType: "image/png", data: "abc" } }],
        },
      ],
    }),
    true
  );
});

test("Gemini: snake_case inline_data is detected too", () => {
  assert.equal(
    requestHasImage({
      contents: [
        { role: "user", parts: [{ inline_data: { mime_type: "image/jpeg", data: "abc" } }] },
      ],
    }),
    true
  );
});

test("Responses API: input_image in the current user turn", () => {
  assert.equal(
    requestHasImage({
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "what is this?" },
            { type: "input_image", image_url: DATA_URL },
          ],
        },
      ],
    }),
    true
  );
});

// The whole point of "current turn".
test("an image in an OLDER turn only returns false", () => {
  assert.equal(
    requestHasImage({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "look at this" },
            { type: "image_url", image_url: { url: DATA_URL } },
          ],
        },
        { role: "assistant", content: "it is a cat" },
        { role: "user", content: "what breed?" },
      ],
    }),
    false
  );
});

test("an older Gemini turn with an image returns false", () => {
  assert.equal(
    requestHasImage({
      contents: [
        { role: "user", parts: [{ inlineData: { mimeType: "image/png", data: "abc" } }] },
        { role: "model", parts: [{ text: "a cat" }] },
        { role: "user", parts: [{ text: "what breed?" }] },
      ],
    }),
    false
  );
});

test("text-only requests return false in every shape", () => {
  assert.equal(requestHasImage({ messages: [{ role: "user", content: "hello" }] }), false);
  assert.equal(
    requestHasImage({ messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }] }),
    false
  );
  assert.equal(
    requestHasImage({ contents: [{ role: "user", parts: [{ text: "hello" }] }] }),
    false
  );
  assert.equal(requestHasImage({ input: "hello" }), false);
});

test("Gemini fileData pointing at a non-image is not an image", () => {
  assert.equal(
    requestHasImage({
      contents: [
        {
          role: "user",
          parts: [{ fileData: { mimeType: "application/pdf", fileUri: "gs://bucket/a.pdf" } }],
        },
      ],
    }),
    false
  );
});

test("malformed and absent bodies never throw", () => {
  for (const body of [
    null,
    undefined,
    "not a body",
    42,
    [],
    {},
    { messages: null },
    { messages: "nope" },
    { messages: [null, undefined, 7] },
    { messages: [{ role: "user" }] },
    { messages: [{ role: "user", content: [null, 1, "x"] }] },
    { contents: [{ role: "user", parts: null }] },
    { input: [{ role: "user", content: undefined }] },
  ]) {
    assert.equal(requestHasImage(body), false, `should be false for ${JSON.stringify(body)}`);
  }
});
