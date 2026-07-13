import test from "node:test";
import assert from "node:assert/strict";

const countTokensRoute = await import("../../src/app/api/v1/messages/count_tokens/route.ts");

async function countTokens(body) {
  const response = await countTokensRoute.POST(
    new Request("http://localhost/api/v1/messages/count_tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

  assert.equal(response.status, 200);
  return response.json();
}

// Minimal fake PNG: 8-byte signature + IHDR width/height at the documented
// offsets (16/20). Not a real, renderable image — just enough bytes for the
// route's header-only dimension parser, matching Anthropic's documented
// "1092x1092 -> ~1600 tokens" reference point.
function fakePngBase64(width, height) {
  const buf = Buffer.alloc(24);
  buf[0] = 0x89;
  buf[1] = 0x50;
  buf[2] = 0x4e;
  buf[3] = 0x47;
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf.toString("base64");
}

// H5: a base64 image block must never be counted as text (the base64 payload
// would otherwise be scanned char-by-char, e.g. a 1MB image -> ~350k tokens).

test("count_tokens: base64 image is estimated from pixel dimensions, not the base64 payload length", async () => {
  const imageData = fakePngBase64(1092, 1092);
  // The base64 string alone is short here, but a real photo's base64 payload
  // can be >1M characters; the assertion below must hold regardless of payload
  // size because the route must never fall through to counting `data` as text.
  const result = await countTokens({
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: imageData },
          },
        ],
      },
    ],
  });

  // ~1092*1092/750 ~= 1590 tokens, well under the base64-as-text explosion
  // (hundreds of thousands of tokens) the pre-fix code would have produced.
  assert.ok(result.input_tokens > 0, "expected a positive token estimate");
  assert.ok(
    result.input_tokens < 5000,
    `expected a bounded per-image estimate, got ${result.input_tokens}`
  );
});

test("count_tokens: a large base64 image payload does not explode the token estimate", async () => {
  // Simulate a large (~1.4M char, ~1MB decoded) base64 image payload appended
  // after a valid PNG header. Pre-fix, this would report ~350k tokens; post-fix
  // it must stay bounded by MAX_IMAGE_TOKENS regardless of payload size.
  const header = fakePngBase64(4000, 4000);
  const padding = "A".repeat(1_400_000);
  const result = await countTokens({
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: header + padding },
          },
        ],
      },
    ],
  });

  assert.ok(
    result.input_tokens < 5000,
    `image token estimate must be bounded, got ${result.input_tokens}`
  );
});

test("count_tokens: image with unparseable/url source falls back to a bounded conservative estimate", async () => {
  const result = await countTokens({
    messages: [
      {
        role: "user",
        content: [{ type: "image", source: { type: "url", url: "https://example.com/x.png" } }],
      },
    ],
  });

  assert.ok(result.input_tokens > 0);
  assert.ok(result.input_tokens < 5000, `expected a bounded fallback, got ${result.input_tokens}`);
});

test("count_tokens: nested image inside tool_result content is estimated, not scanned as text", async () => {
  const imageData = fakePngBase64(800, 600);
  const result = await countTokens({
    messages: [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_img",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/png", data: imageData },
              },
            ],
          },
        ],
      },
    ],
  });

  assert.ok(result.input_tokens > 0);
  assert.ok(result.input_tokens < 5000, `expected a bounded estimate, got ${result.input_tokens}`);
});

// M3: deeply-nested client JSON must not crash the endpoint with a stack overflow.

test("count_tokens: deeply nested tool input does not throw RangeError (stack overflow)", async () => {
  // Depth chosen to comfortably exceed MAX_JSON_DEPTH (100) in the route while
  // staying well under JSON.stringify's own recursion limit, so this test
  // exercises the route's depth guard rather than the test harness's serializer.
  let deeplyNested = { leaf: "value" };
  for (let i = 0; i < 500; i++) {
    deeplyNested = { nested: deeplyNested };
  }

  const result = await countTokens({
    messages: [{ role: "user", content: "hi" }],
    tools: [
      {
        name: "Deep",
        description: "deep tool",
        input_schema: deeplyNested,
      },
    ],
  });

  assert.ok(Number.isFinite(result.input_tokens));
  assert.ok(result.input_tokens >= 0);
});

test("count_tokens: deeply nested tool_result content blocks do not throw RangeError", async () => {
  // Same rationale as above: depth 500 exceeds MAX_JSON_DEPTH (100) without
  // risking a stack overflow inside the test's own JSON.stringify call.
  let nestedBlock = { type: "tool_result", tool_use_id: "toolu_deep", content: "leaf" };
  for (let i = 0; i < 500; i++) {
    nestedBlock = { type: "tool_result", tool_use_id: "toolu_deep", content: [nestedBlock] };
  }

  const result = await countTokens({
    messages: [{ role: "user", content: [nestedBlock] }],
  });

  assert.ok(Number.isFinite(result.input_tokens));
  assert.ok(result.input_tokens >= 0);
});
