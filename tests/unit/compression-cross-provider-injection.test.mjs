import test from "node:test";
import assert from "node:assert/strict";

// This suite proves two things end to end, through the REAL translator
// (translateRequest), never through a hand-built already-translated body:
//
// Part 1: `applyStackedCompression` must run on the INBOUND (pre-translation)
// body. The real call site (chat-core-phase-translate-and-bundle.ts) today
// runs it on `translatedBody` (post-translation) instead — which only has a
// `.system`/`.messages` shape for openai/claude targets. For every other
// target (Codex/openai-responses, Gemini, Kiro) the translated shape is
// `.input`/`.instructions`, `.contents`/`.systemInstruction`, or
// `.conversationState` — none of which `injectCavemanOutputDirective`
// recognizes — so the directive silently never reaches the upstream body.
//
// Part 2: even after Part 1 (compress-before-translate), an inbound request
// that already arrives in Responses (`.input`/`.instructions`) or Gemini
// (`.contents`/`.systemInstruction`) SHAPE — i.e. the source client itself is
// Codex CLI or a Gemini client — needs `caveman-output.ts` / `caveman-en.ts`
// to understand those two inbound shapes directly.

const { translateRequest } = await import("../../open-sse/translator/index.ts");
const { FORMATS } = await import("../../open-sse/translator/formats.ts");
const {
  applyStackedCompression,
  injectCavemanOutputDirective,
  cavemanCompressMessages,
  resolveCompressionBodies,
} = await import("../../open-sse/compression/index.ts");

const FULL_MARKER = "Respond like terse caveman";

function claudeBody() {
  return {
    model: "claude-sonnet-4-6",
    system: "Base instructions.",
    messages: [{ role: "user", content: "hi" }],
  };
}

// ─── Part 1: order matters — translate-then-compress (TODAY'S wiring) ──────

test("BUG documented: translate-then-compress (today's call order) drops the directive for Kiro", () => {
  const translated = translateRequest(
    FORMATS.CLAUDE,
    FORMATS.KIRO,
    "claude-sonnet-4-6",
    claudeBody(),
    true,
    null,
    "kiro",
    null
  );
  const stack = applyStackedCompression(translated, { enabled: false, cavemanOutputLevel: "full" });
  assert.equal(
    stack.cavemanOutput,
    null,
    "today's order silently no-ops for Kiro's conversationState shape"
  );
  const content = translated?.conversationState?.currentMessage?.userInputMessage?.content || "";
  assert.ok(!content.includes(FULL_MARKER));
});

// Note: Gemini and Codex (openai-responses) targets are NOT covered by a
// "translate-then-compress still no-ops" case here. Once Part 2 taught
// `injectCavemanOutputDirective` to recognize `.contents`/`.systemInstruction`
// and `.instructions` as injection targets in their own right, those two
// shapes happen to ALSO be recognized post-translation — so the old (wrong)
// call order stops being a reliable demonstration of the bug for those two
// targets specifically. Kiro's translated shape (`conversationState`) is
// deliberately never taught to the compression layer (see
// docs — the directive reaches Kiro only via Part 1's reordering, by riding
// along inside `body.system` through the normal claude->openai->kiro hub
// translation), so it remains the one target where wrong-order vs.
// right-order is unambiguous — see the two Kiro tests above/below.

// ─── Part 1: order matters — compress-then-translate (FIXED wiring) ────────

test("FIX: compress-then-translate delivers the directive to Kiro's <instructions> block", () => {
  const inbound = claudeBody();
  const stack = applyStackedCompression(inbound, { enabled: false, cavemanOutputLevel: "full" });
  assert.ok(stack.cavemanOutput, "directive must be injected into the pre-translation Claude body");
  const translated = translateRequest(
    FORMATS.CLAUDE,
    FORMATS.KIRO,
    "claude-sonnet-4-6",
    inbound,
    true,
    null,
    "kiro",
    null
  );
  const content = translated?.conversationState?.currentMessage?.userInputMessage?.content || "";
  assert.ok(content.includes("<instructions>"));
  assert.ok(content.includes(FULL_MARKER));
});

test("FIX: compress-then-translate delivers the directive to Gemini's systemInstruction.parts", () => {
  const inbound = claudeBody();
  applyStackedCompression(inbound, { enabled: false, cavemanOutputLevel: "full" });
  const translated = translateRequest(
    FORMATS.CLAUDE,
    FORMATS.GEMINI,
    "claude-sonnet-4-6",
    inbound,
    true,
    null,
    "gemini",
    null
  );
  const joined = (translated.systemInstruction?.parts || []).map((p) => p.text).join("\n");
  assert.ok(joined.includes(FULL_MARKER));
});

test("FIX: compress-then-translate delivers the directive to Codex's instructions field", () => {
  const inbound = claudeBody();
  applyStackedCompression(inbound, { enabled: false, cavemanOutputLevel: "full" });
  const translated = translateRequest(
    FORMATS.CLAUDE,
    FORMATS.OPENAI_RESPONSES,
    "claude-sonnet-4-6",
    inbound,
    true,
    null,
    "codex",
    null
  );
  assert.ok(String(translated.instructions || "").includes(FULL_MARKER));
});

// ─── Part 1: gating still works when gate == the mutated (inbound) body ────

test("gating on the inbound body directly: forced tool_choice ('required') still suppresses injection", () => {
  const inbound = {
    model: "gpt-5",
    tool_choice: "required",
    tools: [{ type: "function", function: { name: "get_weather", parameters: {} } }],
    messages: [{ role: "user", content: "hi" }],
  };
  const stack = applyStackedCompression(inbound, { enabled: false, cavemanOutputLevel: "full" });
  assert.equal(stack.cavemanOutput, null);
});

test("gating on the inbound body directly: response_format json_schema still suppresses injection", () => {
  const inbound = {
    model: "gpt-5",
    response_format: { type: "json_schema", json_schema: { name: "x", schema: {} } },
    messages: [{ role: "user", content: "hi" }],
  };
  const stack = applyStackedCompression(inbound, { enabled: false, cavemanOutputLevel: "full" });
  assert.equal(stack.cavemanOutput, null);
});

test("gating on the inbound body directly: tool_choice 'auto' (string) still gets the directive", () => {
  const inbound = {
    model: "gpt-5",
    tool_choice: "auto",
    tools: [{ type: "function", function: { name: "get_weather", parameters: {} } }],
    messages: [{ role: "user", content: "hi" }],
  };
  const stack = applyStackedCompression(inbound, { enabled: false, cavemanOutputLevel: "full" });
  assert.ok(stack.cavemanOutput);
});

// ─── Part 2: openai-responses SOURCE inbound shape (.input / .instructions) ─

function responsesInboundBody() {
  return {
    model: "gpt-5-codex",
    instructions: "Base.",
    input: [
      {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "I would like to please just really carefully review this diff carefully again and again.",
          },
        ],
      },
    ],
  };
}

test("FIX: Responses-source inbound body gets the directive appended to .instructions and carries to a translated target", () => {
  const body = responsesInboundBody();
  const result = injectCavemanOutputDirective(body, "full");
  assert.ok(result, "directive must be injected into the Responses instructions field");
  assert.ok(body.instructions.includes(FULL_MARKER));

  const translated = translateRequest(
    FORMATS.OPENAI_RESPONSES,
    FORMATS.CLAUDE,
    "gpt-5-codex",
    body,
    true,
    null,
    "codex",
    null
  );
  // Claude's `system` field may be a plain string or a content-block array
  // (`[{type:"text", text}]`) depending on what else populates it (e.g. the
  // Claude Code system-prompt prefix) — check both shapes.
  assert.ok(JSON.stringify(translated.system || "").includes(FULL_MARKER));
});

test("FIX: cavemanCompressMessages compresses EN filler in the Responses .input array", () => {
  const body = responsesInboundBody();
  const stats = cavemanCompressMessages(body);
  assert.ok(stats);
  assert.ok(stats.bytesAfter < stats.bytesBefore);
  assert.ok(!body.input[0].content[0].text.includes("I would like to"));
});

// ─── Part 2: gemini SOURCE inbound shape (.contents / .systemInstruction) ──

function geminiInboundBody() {
  return {
    model: "gemini-2.5-pro",
    systemInstruction: { role: "user", parts: [{ text: "Base." }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: "I would like to please just really carefully review this diff carefully again and again.",
          },
        ],
      },
    ],
  };
}

test("FIX: Gemini-source inbound body gets the directive appended to .systemInstruction.parts and carries to a translated target", () => {
  const body = geminiInboundBody();
  const result = injectCavemanOutputDirective(body, "full");
  assert.ok(result, "directive must be injected into the Gemini systemInstruction field");
  const joined = body.systemInstruction.parts.map((p) => p.text).join("");
  assert.ok(joined.includes(FULL_MARKER));

  const translated = translateRequest(
    FORMATS.GEMINI,
    FORMATS.OPENAI,
    "gemini-2.5-pro",
    body,
    true,
    null,
    "gemini",
    null
  );
  const systemMsg = (translated.messages || []).find((m) => m.role === "system");
  assert.ok(systemMsg && systemMsg.content.includes(FULL_MARKER));
});

test("FIX: cavemanCompressMessages compresses EN filler in Gemini's .contents parts", () => {
  const body = geminiInboundBody();
  const stats = cavemanCompressMessages(body);
  assert.ok(stats);
  assert.ok(stats.bytesAfter < stats.bytesBefore);
  assert.ok(!body.contents[0].parts[0].text.includes("I would like to"));
});

// ─── Off-by-default: byte-identical across all four inbound shapes ─────────

test("off-by-default: cavemanOutputLevel 'off' leaves all four inbound shapes byte-identical", () => {
  const bodies = [
    { model: "gpt-5", messages: [{ role: "user", content: "hi" }] },
    claudeBody(),
    responsesInboundBody(),
    geminiInboundBody(),
  ];
  for (const body of bodies) {
    const before = JSON.stringify(body);
    const stack = applyStackedCompression(body, { enabled: false, cavemanOutputLevel: "off" });
    assert.equal(stack.cavemanOutput, null);
    assert.equal(
      JSON.stringify(body),
      before,
      `byte-identical for shape: ${Object.keys(body).join(",")}`
    );
  }
});

// ─── pipeline.ts: gate must apply on the "stacked" (enabled) branch too ────

test("REGRESSION: applyStackedCompression gates the directive on the enabled/stacked branch too, not just the disabled branch", () => {
  const body = {
    tool_choice: "required",
    tools: [{ type: "function", function: { name: "x" } }],
    messages: [{ role: "user", content: "please just really review this carefully" }],
  };
  const stack = applyStackedCompression(body, {
    enabled: true,
    userAgent: "curl/8.0",
    cavemanOutputLevel: "full",
  });
  assert.equal(stack.mode, "stacked");
  assert.equal(
    stack.cavemanOutput,
    null,
    "forced tool_choice must suppress the directive even when the input-compaction stack is enabled"
  );
});

// ─── CRITICAL: shallow-spread aliasing across retry attempts ──────────────
//
// The real call site (src/sse/handlers/chat.ts:836, executeChatWithBreaker)
// passes `{ ...body, model }` — a SHALLOW spread — into chat-core on every
// credential-retry / combo-inner-retry attempt, reusing the SAME `body`
// object across attempts. `p.body.messages`, `p.body.system`, and
// `p.body.systemInstruction` are therefore the SAME references the caller
// holds, not copies. `resolveCompressionBodies` (used by
// chat-core-phase-translate-and-bundle.ts) must hand compression a PRIVATE
// clone so mutating it never touches the caller's arrays, across any number
// of retries. This harness mirrors that exact object flow using the real
// production functions (`resolveCompressionBodies`, `applyStackedCompression`),
// not a hand-built already-compressed literal.
function retryAttempt(clientBody, provider, model, opts) {
  const p = { body: { ...clientBody, model: `${provider}/${model}` } };
  const resolved = resolveCompressionBodies(p.body, opts);
  p.rawBody = resolved.rawBody;
  p.body = resolved.body;
  applyStackedCompression(p.body, {
    enabled: opts.compressionEnabled,
    cavemanOutputLevel: opts.cavemanOutputLevel,
  });
  return p;
}

const RETRY_OPTS = { compressionEnabled: false, cavemanOutputLevel: "full" };

test("CRITICAL: claude system array — 3 retry attempts never touch the client's own array, directive exactly once per attempt", () => {
  const clientBody = {
    system: [{ type: "text", text: "Base." }],
    messages: [{ role: "user", content: "hi" }],
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const p = retryAttempt(clientBody, "anthropic", "claude-sonnet-4-6", RETRY_OPTS);
    const hits = p.body.system.filter((b) => b.text?.includes(FULL_MARKER)).length;
    assert.equal(
      hits,
      1,
      `attempt ${attempt}: directive must appear exactly once in the upstream body`
    );
  }
  assert.equal(
    clientBody.system.length,
    1,
    "client's own system array must be untouched after 3 retries"
  );
  assert.ok(!clientBody.system[0].text.includes(FULL_MARKER));
});

test("CRITICAL: openai system message — 3 retry attempts never touch the client's own messages array", () => {
  const clientBody = {
    messages: [
      { role: "system", content: "Base." },
      { role: "user", content: "hi" },
    ],
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const p = retryAttempt(clientBody, "openai", "gpt-5", RETRY_OPTS);
    const sysMsg = p.body.messages.find((m) => m.role === "system");
    const hits = (sysMsg.content.match(new RegExp(FULL_MARKER, "g")) || []).length;
    assert.equal(hits, 1, `attempt ${attempt}: directive must appear exactly once`);
  }
  assert.equal(
    clientBody.messages[0].content,
    "Base.",
    "client's own system message must be untouched"
  );
});

test("CRITICAL: openai body with no system message — client's own messages array never grows across 3 retries", () => {
  const clientBody = { messages: [{ role: "user", content: "hi" }] };
  for (let attempt = 1; attempt <= 3; attempt++) {
    retryAttempt(clientBody, "openai", "gpt-5", RETRY_OPTS);
  }
  assert.equal(
    clientBody.messages.length,
    1,
    "client's own messages array must stay [user] — must never become [system, user]"
  );
});

test("CRITICAL: gemini systemInstruction.parts — 3 retry attempts never touch the client's own parts array", () => {
  const clientBody = {
    systemInstruction: { role: "user", parts: [{ text: "Base." }] },
    contents: [{ role: "user", parts: [{ text: "hi" }] }],
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const p = retryAttempt(clientBody, "gemini", "gemini-2.5-pro", RETRY_OPTS);
    const hits = p.body.systemInstruction.parts.filter((pt) =>
      pt.text?.includes(FULL_MARKER)
    ).length;
    assert.equal(hits, 1, `attempt ${attempt}: directive must appear exactly once`);
  }
  assert.equal(clientBody.systemInstruction.parts.length, 1);
});

// ─── Semantic-cache signature stability across retries ────────────────────

test("rawBody stays pristine and identical across retry attempts (semantic-cache signature stability)", () => {
  const clientBody = {
    messages: [
      { role: "system", content: "Base." },
      { role: "user", content: "hi" },
    ],
  };
  const p1 = retryAttempt(clientBody, "openai", "gpt-5", RETRY_OPTS);
  assert.ok(
    !JSON.stringify(p1.rawBody).includes(FULL_MARKER),
    "attempt 1's rawBody must be pristine"
  );
  const p2 = retryAttempt(clientBody, "openai", "gpt-5", RETRY_OPTS);
  assert.ok(
    !JSON.stringify(p2.rawBody).includes(FULL_MARKER),
    "attempt 2's rawBody must still be pristine — the client never sent the directive"
  );
  assert.deepEqual(
    p1.rawBody,
    p2.rawBody,
    "rawBody must be stable across attempts for a semantic-cache signature to ever match"
  );
});

// ─── PERF: default path skips the clone entirely ───────────────────────────

test("PERF: default (compression disabled + cavemanOutputLevel off) skips the clone — rawBody/body are the SAME reference", () => {
  const clientBody = { messages: [{ role: "user", content: "hi" }] };
  const p = { body: { ...clientBody, model: "openai/gpt-5" } };
  const resolved = resolveCompressionBodies(p.body, {
    compressionEnabled: false,
    cavemanOutputLevel: "off",
  });
  assert.equal(resolved.body, p.body, "no clone expected on the default path");
  assert.equal(resolved.rawBody, p.body, "rawBody is the pristine reference, not a copy");
});

test("off-by-default: cavemanOutputLevel 'off' + compression disabled leaves the body byte-identical AND skips the clone", () => {
  const bodies = [
    { model: "gpt-5", messages: [{ role: "user", content: "hi" }] },
    claudeBody(),
    responsesInboundBody(),
    geminiInboundBody(),
  ];
  for (const body of bodies) {
    const before = JSON.stringify(body);
    const resolved = resolveCompressionBodies(body, {
      compressionEnabled: false,
      cavemanOutputLevel: "off",
    });
    assert.equal(resolved.body, body, "clone must be skipped for the default settings");
    const stack = applyStackedCompression(resolved.body, {
      enabled: false,
      cavemanOutputLevel: "off",
    });
    assert.equal(stack.cavemanOutput, null);
    assert.equal(
      JSON.stringify(body),
      before,
      `byte-identical for shape: ${Object.keys(body).join(",")}`
    );
  }
});
