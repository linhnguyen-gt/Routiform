/**
 * Regression: openai-to-gemini.ts built `contents` directly from the
 * openai messages array with no post-pass to merge consecutive same-role
 * entries or drop zero-part entries. Gemini rejects both shapes with
 * 400 invalid_argument.
 */

import test from "node:test";
import assert from "node:assert/strict";

const { translateRequest } = await import("../../open-sse/translator/index.ts");
const { FORMATS } = await import("../../open-sse/translator/formats.ts");

test("consecutive same-role assistant turns are merged into a single Gemini content entry", () => {
  // Two back-to-back assistant tool-call turns (no intervening tool response
  // yet on the second) can legitimately produce two adjacent "model" content
  // entries from the base conversion; Gemini requires them merged.
  const messages = [
    { role: "user", content: "call get_weather twice" },
    {
      role: "assistant",
      content: "checking Tokyo",
      tool_calls: [
        { id: "call_1", type: "function", function: { name: "get_weather", arguments: "{}" } },
      ],
    },
    { role: "tool", tool_call_id: "call_1", content: '{"temp":"15C"}' },
    {
      role: "assistant",
      content: "checking London",
      tool_calls: [
        { id: "call_2", type: "function", function: { name: "get_weather", arguments: "{}" } },
      ],
    },
    { role: "tool", tool_call_id: "call_2", content: '{"temp":"10C"}' },
  ];

  const out = translateRequest(FORMATS.OPENAI, FORMATS.GEMINI, "gemini-2.0-flash", {
    model: "gemini-2.0-flash",
    messages,
    stream: false,
  });

  for (let i = 1; i < out.contents.length; i++) {
    assert.notEqual(
      out.contents[i].role,
      out.contents[i - 1].role,
      `contents[${i - 1}] and contents[${i}] both have role "${out.contents[i].role}" — should have been merged`
    );
  }
});

test("empty-part content entries never reach the Gemini request", () => {
  const messages = [{ role: "user", content: "hello" }];

  const out = translateRequest(FORMATS.OPENAI, FORMATS.GEMINI, "gemini-2.0-flash", {
    model: "gemini-2.0-flash",
    messages,
    stream: false,
  });

  for (const c of out.contents) {
    assert.ok(Array.isArray(c.parts) && c.parts.length > 0, "every content entry must have parts");
  }
});
