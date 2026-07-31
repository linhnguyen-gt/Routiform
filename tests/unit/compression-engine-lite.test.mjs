import test from "node:test";
import assert from "node:assert/strict";

const { liteEngine } = await import("../../open-sse/compression/engines/lite.ts");

function ctx(overrides = {}) {
  return {
    provider: "openai",
    model: "gpt-4o",
    userAgent: "curl/8.0",
    rtkProfile: "full",
    bodyShape: "openai-chat",
    conversationId: null,
    apiKeyId: null,
    ...overrides,
  };
}

const run = (body, c = ctx()) => liteEngine.apply(body, c);

test("lite is lossless and runs before rtk", () => {
  assert.equal(liteEngine.stage, "lossless");
  assert.ok(liteEngine.order < 100, "must sort before rtk's order of 100");
});

test("collapses runs of spaces and blank lines in prose", () => {
  const body = {
    messages: [{ role: "user", content: "hello     world\n\n\n\n\nand    again" }],
  };
  const res = run(body);
  assert.equal(res.applied, true);
  assert.equal(body.messages[0].content, "hello world\n\nand again");
  assert.ok(res.bytesAfter < res.bytesBefore);
});

test("leaves fenced code blocks byte-identical", () => {
  const code = "```py\ndef f():\n    x  =  1\n\n\n    return    x\n```";
  const body = { messages: [{ role: "user", content: `before     ${code}     after` }] };
  run(body);
  assert.ok(body.messages[0].content.includes(code), "indentation inside a fence is meaning");
});

test("leaves inline code and URLs byte-identical", () => {
  const inline = "`a  b`";
  const url = "https://example.com/x?a=1&b=2";
  const body = { messages: [{ role: "user", content: `see ${inline}   at   ${url}   ok` }] };
  run(body);
  assert.ok(body.messages[0].content.includes(inline));
  assert.ok(body.messages[0].content.includes(url));
});

test("trims a data-URL image payload down to a marker", () => {
  const huge = "data:image/png;base64," + "A".repeat(5000);
  const body = {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "what is this" },
          { type: "image_url", image_url: { url: huge } },
        ],
      },
    ],
  };
  const res = run(body);
  assert.equal(res.applied, true);
  const kept = body.messages[0].content[1].image_url.url;
  assert.ok(kept.length < 200, "payload trimmed");
  assert.ok(kept.startsWith("data:image/png;base64,"), "mime prefix preserved");
});

test("leaves a short data URL alone rather than churning it", () => {
  const small = "data:image/png;base64,AAAA";
  const body = {
    messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: small } }] }],
  };
  run(body);
  assert.equal(body.messages[0].content[0].image_url.url, small);
});

test("returns applied:false and touches nothing when there is nothing to collapse", () => {
  const body = { messages: [{ role: "user", content: "already tight prose" }] };
  const before = JSON.stringify(body);
  const res = run(body);
  assert.equal(res.applied, false);
  assert.deepEqual(res.touchedIndices, []);
  assert.equal(JSON.stringify(body), before);
});

test("never grows the body", () => {
  const samples = [
    "plain",
    "a\tb\tc",
    "```\nx\n```",
    "https://a.example/b",
    "trailing   ",
    "   leading",
    "mixed  `code`  https://x.example  text",
  ];
  for (const s of samples) {
    const body = { messages: [{ role: "user", content: s }] };
    const res = run(body);
    assert.ok(res.bytesAfter <= res.bytesBefore, `grew on: ${JSON.stringify(s)}`);
  }
});

test("reports the indices it touched, and only those", () => {
  const body = {
    messages: [
      { role: "user", content: "no   change  needed?  yes   change" },
      { role: "user", content: "tight" },
      { role: "user", content: "loose    text" },
    ],
  };
  const res = run(body);
  assert.deepEqual(res.touchedIndices, [0, 2]);
});

test("handles the OpenAI Responses input array as well as messages", () => {
  const body = { input: [{ role: "user", content: "spaced     out" }] };
  const res = run(body);
  assert.equal(res.applied, true);
  assert.equal(body.input[0].content, "spaced out");
});

test("declines a body shape it cannot walk", () => {
  assert.equal(liteEngine.supports(ctx({ bodyShape: "kiro" })), false);
  const body = { conversationState: { currentMessage: {} } };
  const res = run(body);
  assert.equal(res.applied, false);
});

test("skips tool-role messages, matching caveman's role gating", () => {
  // Tool output is data, not prose. Collapsing whitespace in a grep result or a
  // file read changes what the model sees the file to contain.
  const body = { messages: [{ role: "tool", content: "line1\n\n\n\nline2    end" }] };
  const before = body.messages[0].content;
  const res = run(body);
  assert.equal(res.applied, false);
  assert.equal(body.messages[0].content, before);
});
