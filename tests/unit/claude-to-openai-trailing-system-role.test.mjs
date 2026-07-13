/**
 * Regression: a trailing role:"system" message inside body.messages[] was
 * mapped to "assistant" by claude-to-openai.ts (`msg.role === "user" ||
 * msg.role === "tool" ? "user" : "assistant"`), so the conversation ended on
 * an assistant turn. Claude Code appends a role:"system" message at the end
 * of messages[]; OpenAI-compat providers that reverse-translate to Anthropic
 * (LiteLLM et al.) then reject the request with 400 "assistant message
 * prefill".
 *
 * Fix: map the TRAILING role:"system" -> "user", wrapped in
 * <system-reminder>...</system-reminder>.
 *
 * Follow-up regression (M1): the guard was position-independent
 * (`msg.role === "system"`), so it fired on every system message, not just
 * the trailing one. Mid-conversation system messages previously collapsed
 * into "assistant" role (which "accidentally" satisfied strict
 * user/assistant alternation enforced by some reverse-translating
 * backends), the text-only extraction silently dropped non-text blocks
 * (e.g. images), and an empty-text mid-conversation system message would
 * vanish entirely. Fix: scope the <system-reminder> wrap to the trailing
 * message only; every other system message now passes through unchanged as
 * role "system" (content, including non-text blocks, preserved) and is
 * never dropped.
 */

import test from "node:test";
import assert from "node:assert/strict";

const { claudeToOpenAIRequest } =
  await import("../../open-sse/translator/request/claude-to-openai.ts");

test("trailing role:system message translates to a user turn wrapped in <system-reminder>", () => {
  const req = {
    messages: [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
      { role: "system", content: "Reminder: stay in character." },
    ],
  };

  const out = claudeToOpenAIRequest("gpt-4o", req, false);
  const lastMessage = out.messages[out.messages.length - 1];

  assert.equal(lastMessage.role, "user", "trailing system message must become a user turn");
  assert.equal(
    lastMessage.content,
    "<system-reminder>\nReminder: stay in character.\n</system-reminder>"
  );
});

test("trailing system message with array content joins text blocks", () => {
  const req = {
    messages: [
      { role: "user", content: "hello" },
      {
        role: "system",
        content: [
          { type: "text", text: "line one" },
          { type: "text", text: "line two" },
        ],
      },
    ],
  };

  const out = claudeToOpenAIRequest("gpt-4o", req, false);
  const lastMessage = out.messages[out.messages.length - 1];

  assert.equal(lastMessage.role, "user");
  assert.equal(lastMessage.content, "<system-reminder>\nline one\nline two\n</system-reminder>");
});

test("empty-text trailing system message is dropped rather than emitting an empty user turn", () => {
  const req = {
    messages: [
      { role: "user", content: "hello" },
      { role: "system", content: "   " },
    ],
  };

  const out = claudeToOpenAIRequest("gpt-4o", req, false);
  assert.equal(out.messages.length, 1);
  assert.equal(out.messages[0].role, "user");
  assert.equal(out.messages[0].content, "hello");
});

test("trailing system message with an image block preserves the image instead of dropping it", () => {
  const req = {
    messages: [
      { role: "user", content: "hello" },
      {
        role: "system",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: "abc123" } },
          { type: "text", text: "Reminder text" },
        ],
      },
    ],
  };

  const out = claudeToOpenAIRequest("gpt-4o", req, false);
  const lastMessage = out.messages[out.messages.length - 1];

  assert.equal(lastMessage.role, "user");
  assert.ok(Array.isArray(lastMessage.content), "content must be an array to carry the image part");
  const imagePart = lastMessage.content.find((p) => p.type === "image_url");
  assert.ok(imagePart, "image part must survive translation");
  assert.equal(imagePart.image_url.url, "data:image/png;base64,abc123");
  const textPart = lastMessage.content.find((p) => p.type === "text");
  assert.equal(textPart.text, "<system-reminder>\nReminder text\n</system-reminder>");
});

// ─── M1: mid-conversation system messages must not be misrouted ───────────

test("mid-conversation system message stays role:system and does not vanish (no role dropped)", () => {
  const req = {
    messages: [
      { role: "user", content: "hello" },
      { role: "system", content: "be nice" },
      { role: "user", content: "bye" },
    ],
  };

  const out = claudeToOpenAIRequest("gpt-4o", req, false);

  assert.equal(out.messages.length, 3, "no message may be dropped");
  const roles = out.messages.map((m) => m.role);
  assert.deepEqual(roles, ["user", "system", "user"]);
  // Valid for OpenAI-compat backends: role stays "system" (never collapses
  // into "assistant", so the mid-conversation turn doesn't accidentally
  // create a spurious assistant turn, and never duplicates into "user" so
  // it doesn't create adjacent same-role turns that strict-alternation
  // backends reject).
  assert.equal(out.messages[1].content, "be nice");
});

test("mid-conversation system message with an image block does not lose the image", () => {
  const req = {
    messages: [
      { role: "user", content: "hello" },
      {
        role: "system",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: "xyz789" } },
        ],
      },
      { role: "user", content: "bye" },
    ],
  };

  const out = claudeToOpenAIRequest("gpt-4o", req, false);

  assert.equal(out.messages.length, 3);
  const midMessage = out.messages[1];
  assert.equal(midMessage.role, "system");
  assert.ok(Array.isArray(midMessage.content));
  const imagePart = midMessage.content.find((p) => p.type === "image_url");
  assert.ok(imagePart, "image part must survive translation for a mid-conversation system message");
  assert.equal(imagePart.image_url.url, "data:image/png;base64,xyz789");
});

test("mid-conversation empty-text system message is preserved, not dropped", () => {
  const req = {
    messages: [
      { role: "user", content: "hello" },
      { role: "system", content: "" },
      { role: "user", content: "bye" },
    ],
  };

  const out = claudeToOpenAIRequest("gpt-4o", req, false);

  assert.equal(out.messages.length, 3, "mid-conversation system message must not vanish silently");
  assert.equal(out.messages[1].role, "system");
});
