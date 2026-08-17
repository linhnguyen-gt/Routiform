import test from "node:test";
import assert from "node:assert/strict";

const {
  clientWantsJsonResponse,
  resolveExplicitStreamAlias,
  resolveStreamFlag,
  stripMarkdownCodeFence,
  stripNonStandardStreamAliases,
} = await import("../../open-sse/utils/aiSdkCompat.ts");

test("T26: explicit stream:true takes priority over Accept application/json (#656)", () => {
  assert.equal(clientWantsJsonResponse("application/json"), true);
  // Body stream:true always wins — even with Accept: application/json
  assert.equal(resolveStreamFlag(true, "application/json"), true);
});

test("T26: text/event-stream keeps SSE behavior", () => {
  assert.equal(clientWantsJsonResponse("text/event-stream"), false);
  assert.equal(resolveStreamFlag(true, "text/event-stream"), true);
});

test("T26: mixed Accept header prefers SSE only when text/event-stream is present", () => {
  assert.equal(clientWantsJsonResponse("application/json, text/event-stream"), false);
  assert.equal(resolveStreamFlag(true, "application/json, text/event-stream"), true);
});

test("T26: markdown code fence stripping unwraps Claude JSON blocks", () => {
  const wrapped = '```json\n{"name":"routiform"}\n```';
  assert.equal(stripMarkdownCodeFence(wrapped), '{"name":"routiform"}');
});

test("T26: non-fenced content is returned unchanged", () => {
  const plain = '{"name":"routiform"}';
  assert.equal(stripMarkdownCodeFence(plain), plain);
});

test("T26: undefined stream falls back to Accept header heuristic (#656)", () => {
  // No explicit stream param — Accept: application/json means no streaming
  assert.equal(resolveStreamFlag(undefined, "application/json"), false);
  // No explicit stream param — SSE only for a caller that named it
  assert.equal(resolveStreamFlag(undefined, "text/event-stream"), true);
});

/**
 * `stream` defaults to false in the OpenAI schema. Answering an omitted flag with
 * an event stream broke any compatible client that sent no specific Accept header
 * — curl's wildcard default included — and left it waiting for a JSON body.
 */
test("T26: an omitted stream flag defaults to JSON, not SSE", () => {
  assert.equal(resolveStreamFlag(undefined, undefined), false);
  assert.equal(resolveStreamFlag(undefined, "*/*"), false);
  assert.equal(resolveStreamFlag(undefined, ""), false);
});

test("T26: explicit stream:false always prevents streaming", () => {
  assert.equal(resolveStreamFlag(false, "text/event-stream"), false);
  assert.equal(resolveStreamFlag(false, undefined), false);
});

test("T26: explicit non-stream aliases are detected", () => {
  assert.equal(resolveExplicitStreamAlias({ non_stream: true }), false);
  assert.equal(resolveExplicitStreamAlias({ disable_stream: true }), false);
  assert.equal(resolveExplicitStreamAlias({ disable_streaming: true }), false);
  assert.equal(resolveExplicitStreamAlias({ streaming: false }), false);
});

test("T26: explicit streaming alias is detected", () => {
  assert.equal(resolveExplicitStreamAlias({ streaming: true }), true);
});

test("T26: non-standard aliases are stripped from request body", () => {
  const payload = {
    non_stream: true,
    disable_stream: true,
    disable_streaming: true,
    streaming: false,
    stream: false,
    messages: [{ role: "user", content: "hello" }],
  };
  stripNonStandardStreamAliases(payload);
  assert.equal("non_stream" in payload, false);
  assert.equal("disable_stream" in payload, false);
  assert.equal("disable_streaming" in payload, false);
  assert.equal("streaming" in payload, false);
  assert.equal(payload.stream, false);
});
