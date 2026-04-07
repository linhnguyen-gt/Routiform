import test from "node:test";
import assert from "node:assert/strict";

const { maybeEnforceRequiredToolChoiceForUrlFetch } =
  await import("../../open-sse/services/urlToolEnforcement.ts");

test("enforces tool_choice=required for URL fetch intent with web tool", () => {
  const body = {
    messages: [
      {
        role: "user",
        content:
          "Hãy đọc và tóm tắt nội dung từ URL https://cursor.com/help/models-and-usage/api-keys",
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "webfetch",
          parameters: {
            type: "object",
            properties: { url: { type: "string" } },
          },
        },
      },
    ],
  };

  const changed = maybeEnforceRequiredToolChoiceForUrlFetch(body);
  assert.equal(changed, true);
  assert.equal(body.tool_choice, "required");
});

test("does not override explicit non-auto tool_choice", () => {
  const body = {
    messages: [
      {
        role: "user",
        content: "Read this URL https://example.com",
      },
    ],
    tools: [{ type: "function", function: { name: "webfetch", parameters: {} } }],
    tool_choice: "none",
  };

  const changed = maybeEnforceRequiredToolChoiceForUrlFetch(body);
  assert.equal(changed, false);
  assert.equal(body.tool_choice, "none");
});

test("does not enforce when no URL fetch intent", () => {
  const body = {
    messages: [{ role: "user", content: "Explain this code snippet" }],
    tools: [{ type: "function", function: { name: "webfetch", parameters: {} } }],
  };

  const changed = maybeEnforceRequiredToolChoiceForUrlFetch(body);
  assert.equal(changed, false);
  assert.equal("tool_choice" in body, false);
});

test("does not enforce for image analysis prompts containing URL", () => {
  const body = {
    messages: [
      {
        role: "user",
        content: "Hãy phân tích ảnh từ URL https://example.com/image.jpg",
      },
    ],
    tools: [{ type: "function", function: { name: "webfetch", parameters: {} } }],
  };

  const changed = maybeEnforceRequiredToolChoiceForUrlFetch(body);
  assert.equal(changed, false);
  assert.equal("tool_choice" in body, false);
});

test("does not enforce when request includes structured image_url content", () => {
  const body = {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Analyze this please" },
          { type: "image_url", image_url: { url: "https://example.com/cat.png" } },
        ],
      },
    ],
    tools: [{ type: "function", function: { name: "webfetch", parameters: {} } }],
  };

  const changed = maybeEnforceRequiredToolChoiceForUrlFetch(body);
  assert.equal(changed, false);
  assert.equal("tool_choice" in body, false);
});
