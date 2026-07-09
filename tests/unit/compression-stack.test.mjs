import test from "node:test";
import assert from "node:assert/strict";

const {
  applyStackedCompression,
  cavemanCompressMessages,
  applyInflationGuard,
  snapshotBody,
  measureBodyBytes,
  formatStackHeader,
} = await import("../../open-sse/compression/index.ts");

test("caveman compresses EN prose and preserves fenced code, inline code, URLs", () => {
  const code = "```js\nconst please = true;\n```";
  const url = "https://example.com/please-just-really";
  const inline = "`please just really`";
  const body = {
    messages: [
      {
        role: "user",
        content:
          "I would like to please just really actually explain the reason why this is important to note that the function is broken. " +
          code +
          " see " +
          url +
          " and " +
          inline,
      },
    ],
  };
  const stats = cavemanCompressMessages(body);
  assert.ok(stats);
  assert.ok(stats.bytesAfter < stats.bytesBefore);
  assert.ok(body.messages[0].content.includes(code));
  assert.ok(body.messages[0].content.includes(url));
  assert.ok(body.messages[0].content.includes(inline));
  assert.ok(!body.messages[0].content.includes("I would like to"));
});

test("caveman skips tool roles", () => {
  const body = {
    messages: [
      {
        role: "tool",
        content: "please just really actually filler text that is long enough to trigger rules",
      },
    ],
  };
  const before = body.messages[0].content;
  cavemanCompressMessages(body);
  assert.equal(body.messages[0].content, before);
});

test("inflation guard restores when compressed body is larger", () => {
  const original = { messages: [{ role: "user", content: "hi" }] };
  const snapshot = snapshotBody(original);
  const bytesBefore = measureBodyBytes(original);
  original.messages[0].content = "hi".repeat(50);
  const { reverted, bytesAfter } = applyInflationGuard(original, snapshot, bytesBefore);
  assert.equal(reverted, true);
  assert.equal(bytesAfter, bytesBefore);
  assert.equal(original.messages[0].content, "hi");
});

test("inflation guard does not revert equal-size no-op", () => {
  const original = { messages: [{ role: "user", content: "short" }] };
  const snapshot = snapshotBody(original);
  const bytesBefore = measureBodyBytes(original);
  const { reverted } = applyInflationGuard(original, snapshot, bytesBefore);
  assert.equal(reverted, false);
  assert.equal(original.messages[0].content, "short");
});

test("stacked pipeline runs RTK on tool diffs when enabled", () => {
  const lines = [
    "diff --git a/src/file.js b/src/file.js",
    "index abc..def 100644",
    "--- a/src/file.js",
    "+++ b/src/file.js",
    "@@ -1,120 +1,120 @@",
  ];
  for (let i = 0; i < 120; i++) {
    lines.push(`-const oldValue${i} = "removed value ${i} with padding padding padding";`);
    lines.push(`+const newValue${i} = "added value ${i} with padding padding padding padding";`);
  }
  const diff = lines.join("\n");
  const body = {
    messages: [
      {
        role: "user",
        content: "I would like to please review this diff carefully and carefully again.",
      },
      { role: "tool", content: diff },
    ],
  };
  const before = measureBodyBytes(body);
  const result = applyStackedCompression(body, { enabled: true, userAgent: "curl/8.0" });
  assert.equal(result.mode, "stacked");
  assert.equal(result.inflationReverted, false);
  assert.ok(result.bytesAfter < before);
  assert.ok(body.messages[1].content.length < diff.length);
  assert.ok(formatStackHeader(result).startsWith("stacked"));
});

test("stacked pipeline is off when disabled", () => {
  const body = {
    messages: [{ role: "user", content: "I would like to please just really explain everything." }],
  };
  const before = body.messages[0].content;
  const result = applyStackedCompression(body, { enabled: false });
  assert.equal(result.mode, "off");
  assert.equal(body.messages[0].content, before);
});
