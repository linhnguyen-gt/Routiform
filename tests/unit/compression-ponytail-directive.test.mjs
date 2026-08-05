import test from "node:test";
import assert from "node:assert/strict";

/**
 * Ponytail is a scope-restraint directive, a different axis from the caveman output directive's
 * terseness — so it is its own `off | on` setting rather than a fourth caveman level, and both can
 * be on at once.
 *
 * It is not an engine and cannot be: `run-engine` reverts any engine whose output is larger than
 * its input, unconditionally, and injecting a directive always grows the body. It ships through the
 * output-directive path, after the inflation guard, like the caveman directive.
 *
 * Assertions here go through the real `applyStackedCompression` rather than calling the injector,
 * so "appears exactly once" is a claim about the outbound body and not about one function.
 */

const { applyStackedCompression } = await import("../../open-sse/compression/pipeline.ts");
const { PONYTAIL_PROMPT } = await import("../../open-sse/compression/ponytail-prompt.ts");
const { CAVEMAN_PROMPTS } = await import("../../open-sse/compression/caveman-output.ts");

function occurrences(body, needle) {
  return JSON.stringify(body).split(JSON.stringify(needle).slice(1, -1)).length - 1;
}

function simpleBody(extra = {}) {
  return {
    model: "claude-sonnet-4.5",
    system: "You are a helpful assistant.",
    messages: [{ role: "user", content: "add a retry to the fetch call" }],
    ...extra,
  };
}

test("ponytail is off by default", () => {
  const body = simpleBody();
  const result = applyStackedCompression(body, { enabled: false });

  assert.equal(result.ponytail, null);
  assert.equal(occurrences(body, PONYTAIL_PROMPT), 0);
});

test("ponytail off is explicit as well as default", () => {
  const body = simpleBody();
  applyStackedCompression(body, { enabled: false, ponytailOutput: "off" });
  assert.equal(occurrences(body, PONYTAIL_PROMPT), 0);
});

test("ponytail on appears exactly once, with the input-side stack off", () => {
  const body = simpleBody();
  const result = applyStackedCompression(body, { enabled: false, ponytailOutput: "on" });

  assert.ok(result.ponytail, "the result must report the injection");
  assert.equal(result.ponytail.target, "system-field");
  assert.equal(occurrences(body, PONYTAIL_PROMPT), 1);
});

test("ponytail on appears exactly once, with the input-side stack enabled", () => {
  const body = simpleBody();
  const result = applyStackedCompression(body, {
    enabled: true,
    userAgent: "curl/8.0",
    ponytailOutput: "on",
  });

  assert.ok(result.ponytail);
  assert.equal(occurrences(body, PONYTAIL_PROMPT), 1);
});

test("caveman and ponytail can both be on, each appearing once", () => {
  const body = simpleBody();
  const result = applyStackedCompression(body, {
    enabled: false,
    cavemanOutputLevel: "lite",
    ponytailOutput: "on",
  });

  assert.ok(result.cavemanOutput);
  assert.ok(result.ponytail);
  assert.equal(occurrences(body, PONYTAIL_PROMPT), 1);
  assert.equal(occurrences(body, CAVEMAN_PROMPTS.lite), 1);
});

test("a forced tool choice suppresses ponytail", () => {
  const body = simpleBody({ tool_choice: { type: "tool", name: "search" } });
  const result = applyStackedCompression(body, { enabled: false, ponytailOutput: "on" });

  assert.equal(result.ponytail, null);
  assert.equal(occurrences(body, PONYTAIL_PROMPT), 0);
});

test("tool_choice auto does not suppress ponytail", () => {
  const body = simpleBody({ tool_choice: { type: "auto" } });
  const result = applyStackedCompression(body, { enabled: false, ponytailOutput: "on" });

  assert.ok(result.ponytail, "auto is the agentic default and must keep the directive");
});

test("structured output suppresses ponytail", () => {
  const body = simpleBody({ response_format: { type: "json_schema", json_schema: {} } });
  const result = applyStackedCompression(body, { enabled: false, ponytailOutput: "on" });

  assert.equal(result.ponytail, null);
  assert.equal(occurrences(body, PONYTAIL_PROMPT), 0);
});

test("Gemini forced function calling suppresses ponytail", () => {
  const body = {
    contents: [{ role: "user", parts: [{ text: "hi" }] }],
    systemInstruction: { role: "user", parts: [{ text: "base" }] },
    toolConfig: { functionCallingConfig: { mode: "ANY" } },
  };
  const result = applyStackedCompression(body, { enabled: false, ponytailOutput: "on" });

  assert.equal(result.ponytail, null);
  assert.equal(occurrences(body, PONYTAIL_PROMPT), 0);
});

test("ponytail reaches an OpenAI-shaped body with no system message", () => {
  const body = {
    model: "gpt-5",
    messages: [{ role: "user", content: "add a retry" }],
  };
  const result = applyStackedCompression(body, { enabled: false, ponytailOutput: "on" });

  assert.equal(result.ponytail.target, "new-system-message");
  assert.equal(body.messages[0].role, "system");
  assert.equal(occurrences(body, PONYTAIL_PROMPT), 1);
});

test("ponytail lands inside the prompt-cache prefix when there is one", () => {
  const body = {
    model: "claude-sonnet-4.5",
    system: [
      { type: "text", text: "preamble" },
      { type: "text", text: "rules", cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: "hi" }],
  };
  applyStackedCompression(body, { enabled: false, ponytailOutput: "on" });

  const directiveIndex = body.system.findIndex((b) => b.text === PONYTAIL_PROMPT);
  const markerIndex = body.system.findIndex((b) => b.cache_control);
  assert.ok(directiveIndex >= 0);
  assert.ok(directiveIndex < markerIndex);
});
