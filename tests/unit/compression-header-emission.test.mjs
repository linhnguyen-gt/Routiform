import test from "node:test";
import assert from "node:assert/strict";

// formatStackHeader always produced a summary and the pipeline always stored it, but nothing read
// it back — the MCP tool documenting the header called the wire-up "optional", so users could not
// see whether compression ran or what it saved.

const { attachCompressionHeader, COMPRESSION_HEADER_NAME } =
  await import("../../open-sse/handlers/chat-core/chat-core-compression-header.ts");

test("the summary is emitted on the outgoing response", () => {
  const result = { response: new Response("ok") };
  attachCompressionHeader(result, "stacked; source=settings; saved=1024");

  assert.equal(
    result.response.headers.get(COMPRESSION_HEADER_NAME),
    "stacked; source=settings; saved=1024"
  );
});

test("no header is emitted when compression did not run", () => {
  const result = { response: new Response("ok") };
  attachCompressionHeader(result, undefined);

  assert.equal(result.response.headers.get(COMPRESSION_HEADER_NAME), null);
});

test("an off summary is still emitted, so a client can tell off from absent", () => {
  const result = { response: new Response("ok") };
  attachCompressionHeader(result, "off; source=disabled");

  assert.equal(result.response.headers.get(COMPRESSION_HEADER_NAME), "off; source=disabled");
});

test("a result carrying no response passes through untouched", () => {
  const result = { success: true };
  assert.equal(attachCompressionHeader(result, "stacked; saved=1"), result);
});

test("immutable response headers do not fail the request", () => {
  const frozen = {
    headers: {
      set() {
        throw new TypeError("immutable");
      },
    },
  };
  const result = { response: frozen };

  assert.doesNotThrow(() => attachCompressionHeader(result, "stacked; saved=1"));
  assert.equal(attachCompressionHeader(result, "stacked; saved=1"), result);
});
