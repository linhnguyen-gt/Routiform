/**
 * Regression: tools without an explicit `type:"function"` wrapper were
 * silently dropped when translating openai -> claude.
 *
 * openai-to-claude.ts previously unwrapped `tool.function` only when BOTH
 * `tool.type === "function"` AND `tool.function` were truthy:
 *   const toolData = tool.type === "function" && tool.function ? tool.function : tool;
 * Legacy/loose clients emit `{ function: { name, parameters } }` with no
 * parent `type`. `toolData` then resolved to the wrapper object itself,
 * `toolData.name` was undefined, and the tool was filtered out entirely —
 * the request succeeded with ZERO tools and no error surfaced.
 *
 * Fix: unwrap on the presence of `tool.function` alone.
 */

import test from "node:test";
import assert from "node:assert/strict";

const { openaiToClaudeRequest } =
  await import("../../open-sse/translator/request/openai-to-claude.ts");

test("bare {function:{...}} tool (no parent type) survives openai->claude translation", () => {
  const request = {
    messages: [{ role: "user", content: "echo hi" }],
    tools: [
      {
        function: {
          name: "echo",
          parameters: { type: "object", properties: { text: { type: "string" } } },
        },
      },
    ],
  };

  const translated = openaiToClaudeRequest("claude-sonnet-4.5", request, false);

  assert.ok(Array.isArray(translated.tools), "expected tools array to survive translation");
  assert.equal(translated.tools.length, 1, "expected the bare-function tool to not be dropped");
  assert.ok(
    translated.tools[0].name.endsWith("echo"),
    `expected tool name to preserve "echo", got ${translated.tools[0].name}`
  );
  assert.deepEqual(translated.tools[0].input_schema, {
    type: "object",
    properties: { text: { type: "string" } },
  });
});

test("standard { type:'function', function:{...} } tool still translates correctly (no regression)", () => {
  const request = {
    messages: [{ role: "user", content: "echo hi" }],
    tools: [
      {
        type: "function",
        function: { name: "echo", parameters: { type: "object", properties: {} } },
      },
    ],
  };

  const translated = openaiToClaudeRequest("claude-sonnet-4.5", request, false);

  assert.equal(translated.tools.length, 1);
  assert.ok(translated.tools[0].name.endsWith("echo"));
});

test("nameless built-in tool (no function wrapper, no name) is still dropped as before", () => {
  const request = {
    messages: [{ role: "user", content: "use tools" }],
    tools: [{ type: "web_search", external_web_access: true }],
  };

  const translated = openaiToClaudeRequest("claude-sonnet-4.5", request, false);

  assert.equal(
    Array.isArray(translated.tools) ? translated.tools.length : 0,
    0,
    "a tool with neither .function nor .name must still be filtered out"
  );
});
