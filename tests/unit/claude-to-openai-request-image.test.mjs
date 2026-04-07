import test from "node:test";
import assert from "node:assert/strict";

const { claudeToOpenAIRequest } =
  await import("../../open-sse/translator/request/claude-to-openai.ts");

test("claudeToOpenAIRequest converts Claude image url source to image_url", () => {
  const req = {
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: "https://example.com/a.png" } },
          { type: "text", text: "analyze this" },
        ],
      },
    ],
  };

  const out = claudeToOpenAIRequest("claude-haiku-4.5", req, true);
  const content = out.messages[0].content;
  assert.ok(Array.isArray(content));
  assert.deepEqual(content[0], {
    type: "image_url",
    image_url: { url: "https://example.com/a.png" },
  });
});

test("claudeToOpenAIRequest keeps base64 image conversion", () => {
  const req = {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: "abc123" },
          },
        ],
      },
    ],
  };

  const out = claudeToOpenAIRequest("claude-haiku-4.5", req, true);
  const content = out.messages[0].content;
  assert.ok(Array.isArray(content));
  assert.equal(content[0].image_url.url, "data:image/png;base64,abc123");
});
