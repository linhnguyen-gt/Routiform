/**
 * Regression: openai -> claude translation silently dropped the JSON-schema
 * instruction for `response_format` requests.
 *
 * In openai-to-claude.ts, `result.system` was assembled by joining
 * `systemParts` into a string BEFORE the `response_format` handler pushed its
 * JSON-schema instruction onto `systemParts`. The push mutated the array,
 * but `result.system` already held the earlier joined string, so the
 * instruction was silently discarded. Claude then received no instruction
 * to produce JSON at all — HTTP 200, prose response, no error surfaced.
 *
 * This test enters through the real `translateRequest` hub (sourceFormat
 * "openai" -> targetFormat "claude"), not the helper directly, so it also
 * covers `prepareClaudeRequest`'s cache_control normalization step.
 */

import test from "node:test";
import assert from "node:assert/strict";

const { translateRequest } = await import("../../open-sse/translator/index.ts");

function getSystemText(translated) {
  assert.ok(Array.isArray(translated.system), "expected translated.system to be an array");
  return translated.system.map((block) => String(block.text ?? "")).join("\n");
}

test("response_format json_schema instruction survives openai->claude translation", () => {
  const body = {
    messages: [{ role: "user", content: "give me the weather" }],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "weather",
        schema: {
          type: "object",
          properties: { temperature: { type: "number" } },
          required: ["temperature"],
        },
      },
    },
  };

  const translated = translateRequest("openai", "claude", "claude-sonnet-4.5", body, false);
  const systemText = getSystemText(translated);

  assert.match(
    systemText,
    /You must respond with valid JSON that strictly follows this JSON schema/,
    "expected the JSON-schema instruction to appear in translated system prompt"
  );
  assert.match(
    systemText,
    /"temperature"/,
    "expected the actual schema content to appear in translated system prompt"
  );
});

test("response_format json_object instruction survives openai->claude translation", () => {
  const body = {
    messages: [{ role: "user", content: "give me json" }],
    response_format: { type: "json_object" },
  };

  const translated = translateRequest("openai", "claude", "claude-sonnet-4.5", body, false);
  const systemText = getSystemText(translated);

  assert.match(
    systemText,
    /You must respond with valid JSON\. Respond ONLY with a JSON object, no other text\./,
    "expected the JSON-object instruction to appear in translated system prompt"
  );
});
