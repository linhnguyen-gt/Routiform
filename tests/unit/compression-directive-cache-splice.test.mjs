import test from "node:test";
import assert from "node:assert/strict";

/**
 * Anthropic's prompt cache covers everything up to and including the last `cache_control` marker.
 * A directive block appended after that marker sits outside the cached prefix, so it is re-sent and
 * re-billed on every turn — and it also pushes nothing into the cache, which is the whole point of
 * injecting it early. The block goes immediately before the last marker: inside the prefix, and as
 * late as possible so ordering the caller depends on moves as little as it can.
 */

const { appendSystemDirective } =
  await import("../../open-sse/compression/append-system-directive.ts");

const DIRECTIVE = "Be terse.";

function block(text, cached = false) {
  const entry = { type: "text", text };
  if (cached) entry.cache_control = { type: "ephemeral" };
  return entry;
}

test("with no marker the block is appended, exactly as before", () => {
  const body = { system: [block("one"), block("two")] };
  const target = appendSystemDirective(body, DIRECTIVE);

  assert.equal(target, "system-field");
  assert.deepEqual(
    body.system.map((b) => b.text),
    ["one", "two", DIRECTIVE]
  );
});

test("with one marker the block lands immediately before it", () => {
  const body = { system: [block("one"), block("two", true)] };
  appendSystemDirective(body, DIRECTIVE);

  assert.deepEqual(
    body.system.map((b) => b.text),
    ["one", DIRECTIVE, "two"]
  );
  const directiveIndex = body.system.findIndex((b) => b.text === DIRECTIVE);
  const markerIndex = body.system.findIndex((b) => b.cache_control);
  assert.ok(directiveIndex < markerIndex, "the directive must sit inside the cached prefix");
});

test("with two markers the block lands before the last one", () => {
  const body = {
    system: [block("one", true), block("two"), block("three", true), block("four")],
  };
  appendSystemDirective(body, DIRECTIVE);

  assert.deepEqual(
    body.system.map((b) => b.text),
    ["one", "two", DIRECTIVE, "three", "four"]
  );
  const directiveIndex = body.system.findIndex((b) => b.text === DIRECTIVE);
  const lastMarker = body.system.reduce((acc, b, i) => (b.cache_control ? i : acc), -1);
  assert.ok(directiveIndex < lastMarker, "the directive must precede the LAST marker");
});

test("the injected block never carries a cache_control marker of its own", () => {
  const body = { system: [block("one", true)] };
  appendSystemDirective(body, DIRECTIVE);

  const injected = body.system.find((b) => b.text === DIRECTIVE);
  assert.ok(injected);
  assert.ok(!("cache_control" in injected), "the block must not become a new cache boundary");
});

test("the same placement applies to an array-content system message", () => {
  const body = {
    messages: [
      { role: "system", content: [block("preamble"), block("rules", true)] },
      { role: "user", content: "hi" },
    ],
  };
  const target = appendSystemDirective(body, DIRECTIVE);

  assert.equal(target, "system-message");
  assert.deepEqual(
    body.messages[0].content.map((b) => b.text),
    ["preamble", DIRECTIVE, "rules"]
  );
});

test("shapes that cannot carry a marker are untouched by the splice logic", () => {
  const stringSystem = { system: "base" };
  assert.equal(appendSystemDirective(stringSystem, DIRECTIVE), "system-field");
  assert.equal(stringSystem.system, `base\n\n${DIRECTIVE}`);

  const instructions = { instructions: "base" };
  assert.equal(appendSystemDirective(instructions, DIRECTIVE), "system-field");
  assert.equal(instructions.instructions, `base\n\n${DIRECTIVE}`);

  const gemini = {
    contents: [{ role: "user", parts: [{ text: "hi" }] }],
    systemInstruction: { role: "user", parts: [{ text: "base" }] },
  };
  assert.equal(appendSystemDirective(gemini, DIRECTIVE), "system-field");
  assert.deepEqual(
    gemini.systemInstruction.parts.map((p) => p.text),
    ["base", DIRECTIVE]
  );
});

test("a body with no system surface is left alone", () => {
  const body = { model: "gpt-5" };
  assert.equal(appendSystemDirective(body, DIRECTIVE), null);
  assert.deepEqual(body, { model: "gpt-5" });
});
