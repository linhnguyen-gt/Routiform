import test from "node:test";
import assert from "node:assert/strict";

import {
  extractComboTestUpstreamError,
  extractComboTestResponseText,
  parseComboTestHttpPayload,
} from "../../src/lib/combos/testHealth.ts";

test("extractComboTestUpstreamError reads OpenAI-style nested error.message", () => {
  assert.equal(
    extractComboTestUpstreamError(
      { error: { message: "Unauthorized", code: "invalid_auth" } },
      "fallback"
    ),
    "invalid_auth: Unauthorized"
  );
});

test("extractComboTestUpstreamError handles string error", () => {
  assert.equal(extractComboTestUpstreamError({ error: "bad" }, "fallback"), "bad");
});

test("extractComboTestUpstreamError uses fallback when no known shape", () => {
  assert.equal(extractComboTestUpstreamError({}, "fallback"), "fallback");
});

test("extractComboTestResponseText unwraps data.choices (Cline-style envelope)", () => {
  const text = extractComboTestResponseText({
    data: {
      object: "chat.completion",
      choices: [
        {
          message: {
            role: "assistant",
            content: [{ type: "text", content: "OK" }],
          },
        },
      ],
    },
  });
  assert.equal(text, "OK");
});

test("extractComboTestResponseText reads Gemini-style message.parts", () => {
  assert.equal(
    extractComboTestResponseText({
      choices: [
        {
          message: {
            role: "assistant",
            parts: [{ text: "OK" }],
          },
        },
      ],
    }),
    "OK"
  );
});

test("extractComboTestResponseText reads message.refusal when content empty", () => {
  assert.equal(
    extractComboTestResponseText({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            refusal: "Cannot comply",
          },
        },
      ],
    }),
    "Cannot comply"
  );
});

test("extractComboTestResponseText reads message.reasoning (Cline reasoning models)", () => {
  assert.equal(
    extractComboTestResponseText({
      choices: [
        {
          message: {
            role: "assistant",
            content: "",
            reasoning: "step by step… OK",
          },
        },
      ],
    }),
    "step by step… OK"
  );
});

test("extractComboTestResponseText reads reasoning-only content[] blocks (Gemini-style)", () => {
  assert.equal(
    extractComboTestResponseText({
      choices: [
        {
          message: {
            role: "assistant",
            content: [{ type: "reasoning", text: "OK" }],
          },
        },
      ],
    }),
    "OK"
  );
});

test("extractComboTestResponseText reads Google GenAI candidates[0].content.parts", () => {
  assert.equal(
    extractComboTestResponseText({
      candidates: [{ content: { parts: [{ text: "OK" }] } }],
    }),
    "OK"
  );
});

test("extractComboTestResponseText handles Cline log envelope (data + provider_metadata)", () => {
  const payload = {
    data: {
      id: "gen_01KNH3G9BXGG63VB0F88EYS7VB",
      object: "chat.completion",
      model: "google/gemini-2.5-flash",
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: "OK",
            provider_metadata: { gateway: { cost: "0" } },
          },
        },
      ],
      usage: { prompt_tokens: 6, completion_tokens: 27 },
    },
  };
  assert.equal(extractComboTestResponseText(payload), "OK");
});

test("parseComboTestHttpPayload falls back from SSE when JSON parse fails", () => {
  const raw = [
    `data: ${JSON.stringify({
      choices: [{ index: 0, delta: { content: "OK" }, finish_reason: "stop" }],
    })}`,
    "data: [DONE]",
  ].join("\n");
  const parsed = parseComboTestHttpPayload(
    raw,
    "cline/google/gemini-2.5-flash",
    "text/event-stream"
  );
  assert.equal(extractComboTestResponseText(parsed), "OK");
});

test("extractComboTestResponseText unwraps result / response envelopes", () => {
  assert.equal(
    extractComboTestResponseText({
      result: {
        choices: [{ message: { role: "assistant", content: "OK" } }],
      },
    }),
    "OK"
  );
  assert.equal(
    extractComboTestResponseText({
      response: {
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "OK" } }],
      },
    }),
    "OK"
  );
});

test("parseComboTestHttpPayload parses double-encoded JSON string", () => {
  const inner = JSON.stringify({
    data: {
      object: "chat.completion",
      choices: [{ message: { role: "assistant", content: "OK" } }],
    },
  });
  const raw = JSON.stringify(inner);
  const parsed = parseComboTestHttpPayload(
    raw,
    "cline/google/gemini-2.5-flash",
    "application/json"
  );
  assert.equal(extractComboTestResponseText(parsed), "OK");
});
