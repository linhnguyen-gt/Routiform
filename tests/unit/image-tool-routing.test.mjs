import test from "node:test";
import assert from "node:assert/strict";

const { maybeEnforceMediaToolForLocalImage } =
  await import("../../open-sse/services/imageToolRouting.ts");

test("enforces media-file tool for local image analysis prompt", () => {
  const body = {
    messages: [
      {
        role: "user",
        content: "'/Users/linh/Downloads/Feedback (1).png' phân tích ảnh này giusp tôi",
      },
    ],
    tools: [
      { type: "function", function: { name: "read", parameters: {} } },
      { type: "function", function: { name: "filesystem_read_media_file", parameters: {} } },
    ],
  };

  const changed = maybeEnforceMediaToolForLocalImage(body);
  assert.equal(changed, true);
  assert.deepEqual(body.tool_choice, {
    type: "function",
    function: { name: "filesystem_read_media_file" },
  });
});

test("enforces media-file tool when read is unavailable", () => {
  const body = {
    messages: [{ role: "user", content: "Analyze /Users/linh/Downloads/example.png" }],
    tools: [{ type: "function", function: { name: "filesystem_read_media_file", parameters: {} } }],
  };

  const changed = maybeEnforceMediaToolForLocalImage(body);
  assert.equal(changed, true);
  assert.deepEqual(body.tool_choice, {
    type: "function",
    function: { name: "filesystem_read_media_file" },
  });
});

test("does not override explicit function tool_choice", () => {
  const body = {
    messages: [{ role: "user", content: "Analyze /tmp/img.png" }],
    tools: [{ type: "function", function: { name: "filesystem_read_media_file", parameters: {} } }],
    tool_choice: { type: "function", function: { name: "read" } },
  };

  const changed = maybeEnforceMediaToolForLocalImage(body);
  assert.equal(changed, false);
  assert.deepEqual(body.tool_choice, { type: "function", function: { name: "read" } });
});

test("does not enforce when request already has structured image blocks", () => {
  const body = {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "analyze" },
          { type: "image_url", image_url: { url: "https://example.com/img.png" } },
        ],
      },
    ],
    tools: [{ type: "function", function: { name: "filesystem_read_media_file", parameters: {} } }],
  };

  const changed = maybeEnforceMediaToolForLocalImage(body);
  assert.equal(changed, false);
  assert.equal("tool_choice" in body, false);
});

test("enforces media tool when prior read-image flow produced unsupported-image marker", () => {
  const body = {
    messages: [
      {
        role: "user",
        content: "'/Users/linh/Documents/camokakis_app/Feedback (1).png' phân tích ảnh",
      },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "read-1",
            type: "function",
            function: {
              name: "read",
              arguments: '{"filePath":"/Users/linh/Documents/camokakis_app/Feedback (1).png"}',
            },
          },
        ],
      },
      { role: "tool", tool_call_id: "read-1", content: "Image read successfully" },
      {
        role: "user",
        content: [
          { type: "text", text: "Attached image(s) from tool result:" },
          {
            type: "text",
            text: "ERROR: Cannot read image (this model does not support image input). Inform the user.",
          },
        ],
      },
    ],
    tools: [
      { type: "function", function: { name: "read", parameters: {} } },
      { type: "function", function: { name: "filesystem_read_media_file", parameters: {} } },
    ],
  };

  const changed = maybeEnforceMediaToolForLocalImage(body);
  assert.equal(changed, true);
  assert.deepEqual(body.tool_choice, {
    type: "function",
    function: { name: "filesystem_read_media_file" },
  });
});

test("does not re-enforce media tool after filesystem_read_media_file was already called", () => {
  const body = {
    messages: [
      {
        role: "user",
        content: "Analyze /Users/linh/Documents/GitHub/Routiform/public/providers/qoder.png",
      },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "media-1",
            type: "function",
            function: {
              name: "filesystem_read_media_file",
              arguments:
                '{"path":"/Users/linh/Documents/GitHub/Routiform/public/providers/qoder.png"}',
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "media-1",
        content: '{"mimeType":"image/png","data":"..."}',
      },
      {
        role: "user",
        content: "continue",
      },
    ],
    tools: [{ type: "function", function: { name: "filesystem_read_media_file", parameters: {} } }],
  };

  const changed = maybeEnforceMediaToolForLocalImage(body);
  assert.equal(changed, false);
  assert.equal("tool_choice" in body, false);
});
