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

test("count_tokens: preserves the plain text-only estimate", async () => {
  const result = await countTokens({
    messages: [{ role: "user", content: "hello world" }],
  });

  assert.equal(result.input_tokens, 3);
});

test("count_tokens: tool-heavy payload exceeds the text-only baseline", async () => {
  const baseline = await countTokens({
    messages: [{ role: "user", content: "please read a file" }],
  });

  const toolHeavy = await countTokens({
    system: "You are a coding assistant with access to file tools.",
    tools: [
      {
        name: "Read",
        description: "Read a file from the local filesystem",
        input_schema: {
          type: "object",
          properties: { file_path: { type: "string" } },
        },
      },
    ],
    messages: [
      { role: "user", content: "please read a file" },
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "toolu_01",
            name: "Read",
            input: { file_path: "/tmp/example.txt" },
          },
          {
            type: "thinking",
            thinking: "I need to inspect the file contents before answering the user.",
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_01",
            content: "line1\nline2\nline3\nsome file content that spans several lines",
          },
        ],
      },
    ],
  });

  assert.ok(
    toolHeavy.input_tokens > baseline.input_tokens,
    `expected tool-heavy count (${toolHeavy.input_tokens}) > text-only baseline (${baseline.input_tokens})`
  );
});

test("count_tokens: tool_use/tool_result/thinking blocks are no longer counted as zero", async () => {
  const result = await countTokens({
    messages: [
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "toolu_02",
            name: "Bash",
            input: { command: "ls -la /var/log" },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_02",
            content: "total 42\ndrwxr-xr-x  8 root root 4096 Jan  1 00:00 .",
          },
        ],
      },
    ],
  });

  assert.ok(result.input_tokens > 0, "structured tool blocks must count toward input_tokens");
});

test("count_tokens: system prompt and tool definitions are counted", async () => {
  const withoutSystem = await countTokens({
    messages: [{ role: "user", content: "hi" }],
  });

  const withSystem = await countTokens({
    system: "You are a coding assistant with a long list of behavioral rules to follow.",
    tools: [
      {
        name: "Write",
        description: "Write a file to disk",
        input_schema: { type: "object", properties: { path: { type: "string" } } },
      },
    ],
    messages: [{ role: "user", content: "hi" }],
  });

  assert.ok(withSystem.input_tokens > withoutSystem.input_tokens);
});
