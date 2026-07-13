import test from "node:test";
import assert from "node:assert/strict";

// These tests exercise the caveman-output gates through the REAL translator
// (openai -> claude), not hand-built already-translated bodies. The gates in
// `injectCavemanOutputDirective` were being evaluated against the TRANSLATED
// body at the call site (chat-core-phase-translate-and-bundle.ts), after
// format translation already transformed/consumed the very fields the gates
// inspect:
//   - tool_choice: "auto" (string, OpenAI) -> {type:"auto"} (object, Claude)
//     `isForcedToolChoice` treated ANY object as forced -> false negative,
//     directive silently never injected for the majority of agentic clients
//     (Cline/OpenCode/Cursor/aider/LiteLLM all send tool_choice: "auto").
//   - response_format: {type:"json_schema", ...} is CONSUMED into the system
//     prompt by openai-to-claude.ts and not preserved on the translated body
//     -> `requiresStructuredOutput` sees nothing -> false positive, the
//     directive corrupts a JSON-schema response (the exact bug the gate was
//     written to prevent).
const { translateRequest } = await import("../../open-sse/translator/index.ts");
const { FORMATS } = await import("../../open-sse/translator/formats.ts");
const { applyStackedCompression, injectCavemanOutputDirective } =
  await import("../../open-sse/compression/index.ts");

test("gating sanity: openai tool_choice 'auto' becomes a Claude {type:'auto'} object after translation", () => {
  const inbound = {
    model: "claude-sonnet-4-6",
    tool_choice: "auto",
    tools: [{ type: "function", function: { name: "get_weather", parameters: {} } }],
    messages: [{ role: "user", content: "hi" }],
  };
  const translated = translateRequest(
    FORMATS.OPENAI,
    FORMATS.CLAUDE,
    "claude-sonnet-4-6",
    inbound,
    true,
    null,
    "anthropic",
    null
  );
  assert.deepEqual(translated.tool_choice, { type: "auto" });
});

test("gating sanity: openai response_format json_schema is not preserved as a field after openai->claude translation", () => {
  const inbound = {
    model: "claude-sonnet-4-6",
    response_format: {
      type: "json_schema",
      json_schema: { name: "x", schema: { type: "object" } },
    },
    messages: [{ role: "user", content: "hi" }],
  };
  const translated = translateRequest(
    FORMATS.OPENAI,
    FORMATS.CLAUDE,
    "claude-sonnet-4-6",
    inbound,
    true,
    null,
    "anthropic",
    null
  );
  // openai-to-claude.ts consumes response_format into a system-prompt
  // instruction and never keeps the field itself — this is what makes
  // `requiresStructuredOutput(translatedBody)` blind to it.
  assert.equal(translated.response_format, undefined);
});

test("FALSE NEGATIVE (bug): tool_choice 'auto' must still receive the caveman directive after openai->claude translation", () => {
  const inbound = {
    model: "claude-sonnet-4-6",
    tool_choice: "auto",
    tools: [{ type: "function", function: { name: "get_weather", parameters: {} } }],
    messages: [{ role: "user", content: "hi" }],
  };
  const translated = translateRequest(
    FORMATS.OPENAI,
    FORMATS.CLAUDE,
    "claude-sonnet-4-6",
    inbound,
    true,
    null,
    "anthropic",
    null
  );
  const stack = applyStackedCompression(translated, {
    enabled: false,
    cavemanOutputLevel: "full",
    cavemanOutputGateBody: inbound,
  });
  assert.ok(
    stack.cavemanOutput,
    "directive must be injected for tool_choice:'auto' (the majority of agentic clients), not gated off"
  );
});

test("FALSE POSITIVE (bug): response_format json_schema must NOT receive the caveman directive after openai->claude translation", () => {
  const inbound = {
    model: "claude-sonnet-4-6",
    response_format: {
      type: "json_schema",
      json_schema: { name: "x", schema: { type: "object" } },
    },
    messages: [{ role: "user", content: "hi" }],
  };
  const translated = translateRequest(
    FORMATS.OPENAI,
    FORMATS.CLAUDE,
    "claude-sonnet-4-6",
    inbound,
    true,
    null,
    "anthropic",
    null
  );
  const stack = applyStackedCompression(translated, {
    enabled: false,
    cavemanOutputLevel: "full",
    cavemanOutputGateBody: inbound,
  });
  assert.equal(
    stack.cavemanOutput,
    null,
    "directive must NOT be injected into a structured-output (json_schema) request"
  );
});

test("forced tool_choice (translated Claude shape) still gates off: tool_choice required -> {type:'any'}", () => {
  const inbound = {
    model: "claude-sonnet-4-6",
    tool_choice: "required",
    tools: [{ type: "function", function: { name: "get_weather", parameters: {} } }],
    messages: [{ role: "user", content: "hi" }],
  };
  const translated = translateRequest(
    FORMATS.OPENAI,
    FORMATS.CLAUDE,
    "claude-sonnet-4-6",
    inbound,
    true,
    null,
    "anthropic",
    null
  );
  assert.deepEqual(translated.tool_choice, { type: "any" });
  const stack = applyStackedCompression(translated, {
    enabled: false,
    cavemanOutputLevel: "full",
    cavemanOutputGateBody: inbound,
  });
  assert.equal(stack.cavemanOutput, null);
});

test("forced tool_choice (translated Claude shape) still gates off: named function -> {type:'tool', name}", () => {
  const inbound = {
    model: "claude-sonnet-4-6",
    tool_choice: { type: "function", function: { name: "get_weather" } },
    tools: [{ type: "function", function: { name: "get_weather", parameters: {} } }],
    messages: [{ role: "user", content: "hi" }],
  };
  const translated = translateRequest(
    FORMATS.OPENAI,
    FORMATS.CLAUDE,
    "claude-sonnet-4-6",
    inbound,
    true,
    null,
    "anthropic",
    null
  );
  assert.deepEqual(translated.tool_choice, { type: "tool", name: "get_weather" });
  const stack = applyStackedCompression(translated, {
    enabled: false,
    cavemanOutputLevel: "full",
    cavemanOutputGateBody: inbound,
  });
  assert.equal(stack.cavemanOutput, null);
});

test("responses-API text.format json_schema (inbound shape) gates off", () => {
  const inbound = {
    model: "claude-sonnet-4-6",
    text: { format: { type: "json_schema", name: "x", schema: {} } },
    messages: [{ role: "user", content: "hi" }],
  };
  const stack = applyStackedCompression(
    { system: "base", messages: [{ role: "user", content: "hi" }] },
    { enabled: false, cavemanOutputLevel: "full", cavemanOutputGateBody: inbound }
  );
  assert.equal(stack.cavemanOutput, null);
});

// ─── Gemini-shaped inbound gates: both gates only understood OpenAI/Claude/
// Responses fields (tool_choice, response_format/text.format) — a Gemini
// inbound body (reaches compression unmodified: detectFormat/
// detectFormatFromEndpoint in open-sse/services/provider.ts:93 detects Gemini
// by `Array.isArray(body.contents)`, no pre-conversion) uses
// `toolConfig.functionCallingConfig.mode` and `generationConfig.responseSchema`/
// `responseMimeType` instead, so both gates previously silently no-oped for
// Gemini traffic — injecting the terseness directive into structured-output
// or forced-function-call requests, corrupting them.

test("Gemini structured output (generationConfig.responseSchema) suppresses the directive", () => {
  const body = {
    model: "gemini-2.5-pro",
    contents: [{ role: "user", parts: [{ text: "hi" }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: { type: "object", properties: { answer: { type: "string" } } },
    },
  };
  const result = injectCavemanOutputDirective(body, "full");
  assert.equal(
    result,
    null,
    "directive must NOT be injected into a Gemini structured-output request"
  );
});

test("Gemini structured output via responseMimeType alone (no explicit schema) suppresses the directive", () => {
  const body = {
    model: "gemini-2.5-pro",
    contents: [{ role: "user", parts: [{ text: "hi" }] }],
    generationConfig: { responseMimeType: "application/json" },
  };
  const result = injectCavemanOutputDirective(body, "full");
  assert.equal(result, null);
});

test("Gemini forced function calling (toolConfig.functionCallingConfig.mode: 'ANY') suppresses the directive", () => {
  const body = {
    model: "gemini-2.5-pro",
    contents: [{ role: "user", parts: [{ text: "hi" }] }],
    toolConfig: { functionCallingConfig: { mode: "ANY" } },
  };
  const result = injectCavemanOutputDirective(body, "full");
  assert.equal(
    result,
    null,
    "directive must NOT be injected when Gemini's toolConfig forces a function call"
  );
});

test("Gemini toolConfig.functionCallingConfig.mode: 'AUTO' still gets the directive", () => {
  const body = {
    model: "gemini-2.5-pro",
    contents: [{ role: "user", parts: [{ text: "hi" }] }],
    toolConfig: { functionCallingConfig: { mode: "AUTO" } },
  };
  const result = injectCavemanOutputDirective(body, "full");
  assert.ok(result, "AUTO leaves the choice to the model — directive must still be injected");
});

test("Gemini toolConfig.functionCallingConfig.mode: 'NONE' (tools forbidden, pure prose) still gets the directive", () => {
  const body = {
    model: "gemini-2.5-pro",
    contents: [{ role: "user", parts: [{ text: "hi" }] }],
    toolConfig: { functionCallingConfig: { mode: "NONE" } },
  };
  const result = injectCavemanOutputDirective(body, "full");
  assert.ok(
    result,
    "NONE forbids tool calls (pure prose response) — directive is safe and must be injected"
  );
});

test("Gemini gates run through applyStackedCompression on the inbound (real pipeline) body too", () => {
  const body = {
    model: "gemini-2.5-pro",
    contents: [{ role: "user", parts: [{ text: "hi" }] }],
    generationConfig: { responseSchema: { type: "object" } },
  };
  const stack = applyStackedCompression(body, { enabled: false, cavemanOutputLevel: "full" });
  assert.equal(stack.cavemanOutput, null);
});

test("off-by-default: applyStackedCompression without cavemanOutputGateBody/cavemanOutputLevel is byte-identical (no regression)", () => {
  const body = {
    messages: [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ],
  };
  const before = JSON.stringify(body);
  const stack = applyStackedCompression(body, { enabled: true, userAgent: "curl/8.0" });
  assert.equal(stack.cavemanOutput, null);
  assert.equal(JSON.stringify(body), before);
});
