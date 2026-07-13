import test from "node:test";
import assert from "node:assert/strict";

const {
  applyStackedCompression,
  cavemanCompressMessages,
  applyInflationGuard,
  snapshotBody,
  measureBodyBytes,
  formatStackHeader,
  CAVEMAN_LEVELS,
  CAVEMAN_PROMPTS,
  getCavemanOutputPrompt,
  injectCavemanOutputDirective,
  formatCavemanOutputLog,
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

// ─── Caveman Output (output-side directive injection) ──────────────────────

test("CAVEMAN_LEVELS only ships lite/full (no ultra/wenyan — YAGNI)", () => {
  assert.deepEqual(Object.values(CAVEMAN_LEVELS).sort(), ["full", "lite"]);
  assert.deepEqual(Object.keys(CAVEMAN_PROMPTS).sort(), ["full", "lite"]);
});

test("getCavemanOutputPrompt returns null for off", () => {
  assert.equal(getCavemanOutputPrompt("off"), null);
});

test("caveman output prompts port upstream's hard-won rules verbatim", () => {
  for (const level of ["lite", "full"]) {
    const prompt = getCavemanOutputPrompt(level);
    assert.ok(prompt.includes("No invented abbreviations"));
    assert.ok(prompt.includes("Preserve the user's dominant language"));
    assert.ok(prompt.includes("No self-reference"));
    assert.ok(prompt.includes("No decorative emoji"));
    // Upstream removed the X -> Y arrow shorthand from ULTRA because models
    // over-applied it. Must never be re-added (Unicode arrow char check).
    assert.ok(!prompt.includes("→"), `level=${level} must not contain a literal arrow`);
  }
});

test("level off (default) produces a byte-identical request — zero regression", () => {
  const body = {
    model: "gpt-5",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Explain recursion." },
    ],
  };
  const before = JSON.stringify(body);
  const result = injectCavemanOutputDirective(body, "off");
  assert.equal(result, null);
  assert.equal(JSON.stringify(body), before);
});

test("applyStackedCompression: default cavemanOutputLevel is off, body untouched", () => {
  const body = {
    messages: [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ],
  };
  const before = JSON.stringify(body);
  // No cavemanOutputLevel passed at all — matches every existing call site today.
  const result = applyStackedCompression(body, { enabled: true, userAgent: "curl/8.0" });
  assert.equal(result.cavemanOutput, null);
  assert.equal(JSON.stringify(body), before);
});

test("applyStackedCompression: cavemanOutputLevel works independently of enabled", () => {
  const body = {
    messages: [{ role: "user", content: "hi" }],
  };
  const result = applyStackedCompression(body, { enabled: false, cavemanOutputLevel: "lite" });
  assert.equal(result.mode, "off");
  assert.ok(result.cavemanOutput);
  assert.equal(result.cavemanOutput.level, "lite");
  assert.equal(result.cavemanOutput.target, "new-system-message");
  assert.equal(body.messages[0].role, "system");
  assert.ok(body.messages[0].content.includes("Respond tersely"));
});

test("injectCavemanOutputDirective: appends to existing string system field (Claude-style)", () => {
  const body = { system: "Base instructions.", messages: [{ role: "user", content: "hi" }] };
  const result = injectCavemanOutputDirective(body, "full");
  assert.equal(result.target, "system-field");
  assert.ok(body.system.startsWith("Base instructions.\n\n"));
  assert.ok(body.system.includes("Respond like terse caveman"));
});

test("injectCavemanOutputDirective: appends to content-block system array (Claude-style)", () => {
  const body = {
    system: [{ type: "text", text: "Base." }],
    messages: [{ role: "user", content: "hi" }],
  };
  const result = injectCavemanOutputDirective(body, "lite");
  assert.equal(result.target, "system-field");
  assert.equal(body.system.length, 2);
  assert.equal(body.system[1].type, "text");
  assert.ok(body.system[1].text.includes("Respond tersely"));
});

test("injectCavemanOutputDirective: appends to existing system message (OpenAI-style)", () => {
  const body = {
    messages: [
      { role: "system", content: "Base." },
      { role: "user", content: "hi" },
    ],
  };
  const result = injectCavemanOutputDirective(body, "full");
  assert.equal(result.target, "system-message");
  assert.equal(body.messages.length, 2);
  assert.ok(body.messages[0].content.startsWith("Base.\n\n"));
});

test("injectCavemanOutputDirective: falls back to a developer-role message", () => {
  const body = {
    messages: [
      { role: "developer", content: "Base." },
      { role: "user", content: "hi" },
    ],
  };
  const result = injectCavemanOutputDirective(body, "lite");
  assert.equal(result.target, "system-message");
  assert.ok(body.messages[0].content.includes("Base."));
});

test("injectCavemanOutputDirective: prepends a new system message when none exists", () => {
  const body = { messages: [{ role: "user", content: "hi" }] };
  const result = injectCavemanOutputDirective(body, "full");
  assert.equal(result.target, "new-system-message");
  assert.equal(body.messages.length, 2);
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.messages[1].role, "user");
});

test("injectCavemanOutputDirective: no-op with no messages/system present", () => {
  const body = { model: "gpt-5" };
  const result = injectCavemanOutputDirective(body, "lite");
  assert.equal(result, null);
});

test("formatCavemanOutputLog formats an injected result and returns null otherwise", () => {
  assert.equal(formatCavemanOutputLog(null), null);
  const line = formatCavemanOutputLog({ level: "lite", target: "system-field" });
  assert.equal(line, "[CavemanOutput] level=lite target=system-field");
});

// ─── Gating: forced tool calls, structured output, destructive overwrite ───

test("injectCavemanOutputDirective: skips when tool_choice forces a specific tool call", () => {
  const body = {
    tools: [{ type: "function", function: { name: "get_weather" } }],
    tool_choice: { type: "function", function: { name: "get_weather" } },
    messages: [{ role: "user", content: "hi" }],
  };
  const before = JSON.stringify(body);
  const result = injectCavemanOutputDirective(body, "full");
  assert.equal(result, null);
  assert.equal(JSON.stringify(body), before);
});

test("injectCavemanOutputDirective: skips when tool_choice is the string 'required'", () => {
  const body = {
    tools: [{ type: "function", function: { name: "get_weather" } }],
    tool_choice: "required",
    messages: [{ role: "user", content: "hi" }],
  };
  const result = injectCavemanOutputDirective(body, "full");
  assert.equal(result, null);
});

test("injectCavemanOutputDirective: still injects when tool_choice is 'auto' or absent", () => {
  const bodyAuto = {
    tools: [{ type: "function", function: { name: "get_weather" } }],
    tool_choice: "auto",
    messages: [{ role: "user", content: "hi" }],
  };
  assert.ok(injectCavemanOutputDirective(bodyAuto, "full"));

  const bodyNoChoice = {
    tools: [{ type: "function", function: { name: "get_weather" } }],
    messages: [{ role: "user", content: "hi" }],
  };
  assert.ok(injectCavemanOutputDirective(bodyNoChoice, "full"));
});

test("injectCavemanOutputDirective: skips when response_format requests json_schema/json_object", () => {
  const jsonSchemaBody = {
    response_format: { type: "json_schema", json_schema: { name: "x", schema: {} } },
    messages: [{ role: "user", content: "hi" }],
  };
  const before = JSON.stringify(jsonSchemaBody);
  assert.equal(injectCavemanOutputDirective(jsonSchemaBody, "full"), null);
  assert.equal(JSON.stringify(jsonSchemaBody), before);

  const jsonObjectBody = {
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: "hi" }],
  };
  assert.equal(injectCavemanOutputDirective(jsonObjectBody, "lite"), null);
});

test("injectCavemanOutputDirective: skips when Responses API text.format requests json_schema", () => {
  const body = {
    text: { format: { type: "json_schema", name: "x", schema: {} } },
    messages: [{ role: "user", content: "hi" }],
  };
  const result = injectCavemanOutputDirective(body, "lite");
  assert.equal(result, null);
});

test("injectCavemanOutputDirective: does not skip on plain text.format (not json_schema)", () => {
  const body = {
    text: { format: { type: "text" } },
    messages: [{ role: "user", content: "hi" }],
  };
  assert.ok(injectCavemanOutputDirective(body, "lite"));
});

test("injectCavemanOutputDirective: does not clobber a non-string/array system message content", () => {
  const weirdContent = { unexpected: "shape" };
  const body = {
    messages: [
      { role: "system", content: weirdContent },
      { role: "user", content: "hi" },
    ],
  };
  const result = injectCavemanOutputDirective(body, "lite");
  assert.equal(result.target, "new-system-message");
  assert.equal(body.messages.length, 3);
  // Original (unrecognized-shape) system message must survive untouched.
  assert.deepEqual(body.messages[1].content, weirdContent);
  assert.equal(body.messages[0].role, "system");
  assert.ok(body.messages[0].content.includes("Respond tersely"));
});

test("injectCavemanOutputDirective: still overwrites a null-content system message (nothing to preserve)", () => {
  const body = {
    messages: [
      { role: "system", content: null },
      { role: "user", content: "hi" },
    ],
  };
  const result = injectCavemanOutputDirective(body, "lite");
  assert.equal(result.target, "system-message");
  assert.equal(body.messages.length, 2);
  assert.ok(body.messages[0].content.includes("Respond tersely"));
});

test("caveman-en skips system role (system prompts must not be rewritten)", () => {
  const body = {
    messages: [
      {
        role: "system",
        content: "Please kindly always going to follow these instructions carefully and carefully.",
      },
    ],
  };
  const before = body.messages[0].content;
  const stats = cavemanCompressMessages(body);
  assert.equal(body.messages[0].content, before);
  assert.equal(stats, null);
});
