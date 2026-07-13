/**
 * filterToOpenAIFormat() unconditionally stripped cache_control from every
 * content block, silently disabling DashScope prompt caching for alicode /
 * alicode-intl (format: "openai"). Adds an opts.preserveCacheControl escape
 * hatch; default behavior (strip) is unchanged when the option is absent.
 */

import test from "node:test";
import assert from "node:assert/strict";

const { filterToOpenAIFormat } = await import("../../open-sse/translator/helpers/openaiHelper.ts");
const { translateRequest } = await import("../../open-sse/translator/index.ts");
const { FORMATS } = await import("../../open-sse/translator/formats.ts");

function bodyWithCacheControl() {
  return {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "large context", cache_control: { type: "ephemeral" } }],
      },
    ],
  };
}

test("filterToOpenAIFormat strips cache_control by default (opts omitted)", () => {
  const body = filterToOpenAIFormat(bodyWithCacheControl());
  assert.equal(body.messages[0].content[0].cache_control, undefined);
});

test("filterToOpenAIFormat preserves cache_control when preserveCacheControl: true", () => {
  const body = filterToOpenAIFormat(bodyWithCacheControl(), { preserveCacheControl: true });
  assert.deepEqual(body.messages[0].content[0].cache_control, { type: "ephemeral" });
});

test("filterToOpenAIFormat always strips signature regardless of preserveCacheControl", () => {
  const body = filterToOpenAIFormat(
    {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "hi",
              signature: "sig123",
              cache_control: { type: "ephemeral" },
            },
          ],
        },
      ],
    },
    { preserveCacheControl: true }
  );
  assert.equal(body.messages[0].content[0].signature, undefined);
  assert.deepEqual(body.messages[0].content[0].cache_control, { type: "ephemeral" });
});

test("translateRequest -> OpenAI target strips cache_control for a provider with no quirks flag (default unchanged)", () => {
  const out = translateRequest(
    FORMATS.CLAUDE,
    FORMATS.OPENAI,
    "gpt-4o",
    {
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "hi", cache_control: { type: "ephemeral" } }],
        },
      ],
    },
    false,
    null,
    "openai"
  );

  const content = out.messages[0].content;
  const block = Array.isArray(content) ? content[0] : content;
  if (typeof block === "object" && block !== null) {
    assert.equal(block.cache_control, undefined);
  }
});
