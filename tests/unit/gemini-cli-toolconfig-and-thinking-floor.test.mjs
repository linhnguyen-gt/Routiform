/**
 * Regression tests for defects in the gemini-cli translator's thinking-
 * budget/maxOutputTokens reconciliation (`fitGeminiThinkingBudget`).
 *
 * 1. `toolConfig: { functionCallingConfig: { mode: "VALIDATED" } }` was set
 *    only inside the `isAntigravity` branch of wrapInCloudCodeEnvelope, so
 *    plain gemini-cli tool requests never got it. toolConfig is intentionally
 *    hoisted out of the isAntigravity branch to apply to every tool-bearing
 *    request. Kept as-is.
 * 2. maxOutputTokens was only ever capped (never raised) when thinking was
 *    enabled, so a small requested max_tokens + high reasoning_effort let the
 *    entire budget be consumed by thought tokens, returning empty content.
 *
 * ROUND 4 (this revision) — three consecutive prior rounds each "fixed" the
 * previous round's bug while introducing a new CRITICAL, because every prior
 * test file only exercised max_tokens values that never included the two
 * values real OpenAI-compatible clients actually send by default (4096,
 * 8192), and asserted a THROW as acceptable behavior. Confirmed CRITICALs
 * fixed this round:
 *
 *  CRITICAL 1: the answer headroom subtracted from the client's cap before
 *  fitting the thinking budget was a flat 8192 constant — bigger than the
 *  cap itself for any `max_tokens <= 8192` (4096/8192 being the most common
 *  client defaults), leaving ZERO room and pinning the budget at the
 *  128-token Pro floor no matter the reasoning_effort. Fixed: the headroom
 *  is now a FRACTION of maxOutputTokens (`min(8192, floor(maxOutputTokens /
 *  2))`), see `geminiAnswerHeadroom` in thinkingBudget.ts. A high-effort
 *  request with max_tokens=8192 now gets a real 4096-token budget instead of
 *  128.
 *
 *  CRITICAL 2: `hasThinkingCapableModel` (a model-name substring check) made
 *  CUSTOM/ADAPTIVE mode inject a thinking budget onto EVERY request to a
 *  thinking-capable model, even ones that never mentioned reasoning at all
 *  (e.g. a title-generation call with `max_tokens: 50`). Combined with the
 *  CRITICAL 4 throw below, an operator turning on CUSTOM/ADAPTIVE mode
 *  400'd every short Gemini call. Fixed: `thinkingBudget.ts` now tags
 *  whether a budget was genuinely client-requested vs. proxy-injected
 *  (`__thinkingClientRequested`); an injected budget that doesn't naturally
 *  fit is simply left off rather than forced or erroring.
 *
 *  CRITICAL 3: the fit check was `if (budget > maxOutputTokens)` — equality
 *  passed, so `max_tokens: 128` against Gemini Pro's 128-token mandatory
 *  floor produced `thinkingBudget: 128, maxOutputTokens: 128` — ZERO room
 *  for the visible answer, guaranteeing empty content. Fixed: `>=`.
 *
 *  CRITICAL 4: `fitGeminiThinkingBudget` threw a 400 when even the mandatory
 *  floor didn't fit under the client's cap. `translateInboundRequestBody`
 *  catches translate-time errors and returns an immediate 400 BEFORE
 *  provider failover is ever reached, so a throw here aborted an entire
 *  combo/fallback chain instead of letting it roll to the next provider.
 *  Fixed: the throw is gone entirely. When no valid non-degenerate budget
 *  fits, thinkingConfig is omitted (model falls back to its own default
 *  thinking behavior) rather than erroring — degrade, don't error.
 *
 *  HIGH 5: gemini-2.5-pro's `defaultThinkingBudget` was 128 — its MINIMUM
 *  enabled budget, not a sane default — so `reasoning_effort: "medium"`
 *  requested only 128 thinking tokens. Fixed to 8192.
 *
 *  HIGH 6: adding real (large) MODEL_SPECS entries for the Gemini 2.5/3.x
 *  family silently multiplied the DEFAULT (no client max_tokens) output
 *  ceiling by up to 8x versus the old unregistered-model placeholder
 *  (8192 -> 65536/65535). Fixed: `capMaxOutputTokens(model)` with no
 *  explicit client request now applies `SAFE_DEFAULT_MAX_OUTPUT_TOKENS`
 *  (16384) as a ceiling — a client that wants the model's full real cap can
 *  always ask for it explicitly via `max_tokens`.
 *
 *  MEDIUM 7: `getModelSpec`'s prefix-matching fallback picked whichever
 *  MODEL_SPECS key happened to be inserted first in object literal order,
 *  so "gemini-2.5-flash-lite-preview-06-17" (which starts with both
 *  "gemini-2.5-flash" and "gemini-2.5-flash-lite") resolved to the plain
 *  Flash spec instead of Flash-Lite's. Fixed: longest-prefix-wins, driven
 *  from the same lookup used everywhere (`getModelSpec`), including the
 *  thinking-floor classification (`mandatoryThinking` /
 *  `minThinkingBudgetWhenEnabled`), which used to be a SEPARATE
 *  exact-match-only table that could silently disagree with the spec's own
 *  classification.
 */

import test from "node:test";
import assert from "node:assert/strict";

const { translateRequest } = await import("../../open-sse/translator/index.ts");
const { FORMATS } = await import("../../open-sse/translator/formats.ts");
const { fitGeminiThinkingBudget, setThinkingBudgetConfig, DEFAULT_THINKING_CONFIG, ThinkingMode } =
  await import("../../open-sse/services/thinkingBudget.ts");
const { OAUTH_PROVIDERS } = await import("../../open-sse/config/registry-providers-oauth.ts");
const { getModelSpec, SAFE_DEFAULT_MAX_OUTPUT_TOKENS } =
  await import("../../src/shared/constants/modelSpecs.ts");

const GEMINI_CLI_MODEL_IDS = OAUTH_PROVIDERS["gemini-cli"].models.map((m) => m.id);

// Mirrors thinkingBudget.ts's internal `geminiAnswerHeadroom` (kept private
// there); duplicated here so tests can compute expected values without
// exporting an internal helper purely for test consumption.
function headroomFor(maxOutputTokens) {
  return Math.min(8192, Math.floor(maxOutputTokens / 2));
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "add",
      description: "Add two numbers",
      parameters: {
        type: "object",
        properties: { a: { type: "number" }, b: { type: "number" } },
        required: ["a", "b"],
      },
    },
  },
];

function requestHighReasoning(model, extra = {}) {
  return translateRequest(
    FORMATS.OPENAI,
    FORMATS.GEMINI_CLI,
    model,
    {
      model,
      messages: [{ role: "user", content: "think hard about this" }],
      reasoning_effort: "high",
      stream: false,
      ...extra,
    },
    false,
    { accessToken: "t", projectId: "p" },
    "gemini-cli"
  );
}

function requestGeminiCLI(model, body) {
  return translateRequest(
    FORMATS.OPENAI,
    FORMATS.GEMINI_CLI,
    model,
    { model, messages: [{ role: "user", content: "hi" }], stream: false, ...body },
    false,
    { accessToken: "t", projectId: "p" },
    "gemini-cli"
  );
}

test("gemini-cli requests with tools carry toolConfig (previously Antigravity-only)", () => {
  const out = translateRequest(
    FORMATS.OPENAI,
    FORMATS.GEMINI_CLI,
    "gemini-3.1-pro-high",
    {
      model: "gemini-3.1-pro-high",
      messages: [{ role: "user", content: "add 2 and 3" }],
      tools: TOOLS,
      stream: false,
    },
    false,
    { accessToken: "t", projectId: "p" },
    "gemini-cli"
  );

  assert.deepEqual(out.request.toolConfig, { functionCallingConfig: { mode: "VALIDATED" } });
});

test("gemini-cli requests without tools get no toolConfig (unchanged default)", () => {
  const out = translateRequest(
    FORMATS.OPENAI,
    FORMATS.GEMINI_CLI,
    "gemini-3.1-pro-high",
    { model: "gemini-3.1-pro-high", messages: [{ role: "user", content: "hi" }], stream: false },
    false,
    { accessToken: "t", projectId: "p" },
    "gemini-cli"
  );

  assert.equal(out.request.toolConfig, undefined);
});

test("CRITICAL 1 (fixed) money guard: high reasoning_effort with a small explicit max_tokens NEVER raises maxOutputTokens above it", () => {
  const out = requestHighReasoning("gemini-3.1-pro-high", { max_tokens: 500 });

  const { thinkingConfig, maxOutputTokens } = out.request.generationConfig;
  assert.equal(
    maxOutputTokens,
    500,
    "client's explicit cap is authoritative and passed through unchanged"
  );
  assert.ok(thinkingConfig, "thinkingConfig must still be sent, not omitted");
  // headroom = min(8192, floor(500/2)) = 250; budget = min(32768, 500-250) = 250
  assert.equal(thinkingConfig.thinkingBudget, 250);
  assert.equal(thinkingConfig.includeThoughts, true);
});

test("CRITICAL 1 (fixed): reasoning_effort high with the two most common real client max_tokens defaults (4096, 8192) is NOT pinned to the floor", () => {
  for (const maxTokens of [4096, 8192]) {
    const out = requestHighReasoning("gemini-2.5-pro", { max_tokens: maxTokens });
    const { thinkingConfig, maxOutputTokens } = out.request.generationConfig;
    assert.equal(maxOutputTokens, maxTokens);
    assert.ok(thinkingConfig, `thinkingConfig must be present at max_tokens=${maxTokens}`);
    assert.ok(
      thinkingConfig.thinkingBudget > 128,
      `max_tokens=${maxTokens} must yield a budget meaningfully above the 128 floor, got ${thinkingConfig.thinkingBudget}`
    );
    assert.equal(thinkingConfig.thinkingBudget, maxTokens - headroomFor(maxTokens));
  }
});

test("CRITICAL 3 (fixed): max_tokens exactly at the Pro mandatory floor (128) omits thinkingConfig instead of emitting budget === maxOutputTokens", () => {
  const out = requestHighReasoning("gemini-3.1-pro-high", { max_tokens: 128 });

  const { thinkingConfig, maxOutputTokens } = out.request.generationConfig;
  assert.equal(maxOutputTokens, 128, "client's explicit 128 cap must be preserved exactly");
  assert.equal(
    thinkingConfig,
    undefined,
    "no valid non-degenerate budget fits — must omit, not emit budget >= maxOutputTokens"
  );
});

test("explicit max_tokens large enough to fit both: thinking budget shrinks partially, cap untouched", () => {
  const out = requestHighReasoning("gemini-3.1-pro-high", { max_tokens: 20000 });

  const { thinkingConfig, maxOutputTokens } = out.request.generationConfig;
  assert.equal(maxOutputTokens, 20000, "client's explicit cap must never be raised");
  // headroom = min(8192, floor(20000/2)) = 8192 (capped); budget = 20000 - 8192 = 11808
  assert.equal(thinkingConfig.thinkingBudget, 11808);
  assert.equal(thinkingConfig.includeThoughts, true);
});

test("HIGH 6 (fixed): no explicit max_tokens applies the safe default output cap, not the model's full 65535/65536 ceiling", () => {
  const out = requestHighReasoning("gemini-3.1-pro-high");

  const { thinkingConfig, maxOutputTokens } = out.request.generationConfig;
  assert.equal(
    maxOutputTokens,
    SAFE_DEFAULT_MAX_OUTPUT_TOKENS,
    "own default is the SAFE ceiling, not the raw model cap"
  );
  assert.equal(
    thinkingConfig.thinkingBudget,
    SAFE_DEFAULT_MAX_OUTPUT_TOKENS - headroomFor(SAFE_DEFAULT_MAX_OUTPUT_TOKENS)
  );
  assert.ok(
    thinkingConfig.thinkingBudget < maxOutputTokens,
    "thinking must never starve the answer"
  );
});

test("no thinking requested: maxOutputTokens is left at the capped default (no floor applied)", () => {
  const out = translateRequest(
    FORMATS.OPENAI,
    FORMATS.GEMINI_CLI,
    "gemini-3.1-pro-high",
    {
      model: "gemini-3.1-pro-high",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 128,
      stream: false,
    },
    false,
    { accessToken: "t", projectId: "p" },
    "gemini-cli"
  );

  assert.equal(out.request.generationConfig.maxOutputTokens, 128);
  assert.equal(out.request.generationConfig.thinkingConfig, undefined);
});

test("H3: real gemini-2.5-pro id with max_tokens: 500 never disables to 0, never exceeds 500 on maxOutputTokens", () => {
  const out = requestHighReasoning("gemini-2.5-pro", { max_tokens: 500 });

  const { thinkingConfig, maxOutputTokens } = out.request.generationConfig;
  assert.equal(
    maxOutputTokens,
    500,
    "client's explicit cap is authoritative and passed through unchanged"
  );
  assert.ok(
    thinkingConfig,
    "gemini-2.5-pro cannot disable thinking; thinkingConfig must still be sent"
  );
  assert.equal(
    thinkingConfig.thinkingBudget,
    250,
    "budget fits within max_tokens - headroom, well above the 128 floor"
  );
});

test("H3: real gemini-2.5-flash id with a small cap now gets a naturally-fitted non-zero budget (no mandatory floor forces it to 0)", () => {
  const out = requestHighReasoning("gemini-2.5-flash", { max_tokens: 500 });

  const { thinkingConfig, maxOutputTokens } = out.request.generationConfig;
  assert.ok(maxOutputTokens <= 500, `must never exceed client's cap, got ${maxOutputTokens}`);
  assert.ok(thinkingConfig, "Flash models keep an explicit thinkingConfig");
  // Flash has no mandatory floor, so the naturally-fitted headroom-based
  // budget (250) survives instead of being forced to 0 or a fixed floor.
  assert.equal(thinkingConfig.thinkingBudget, 250);
});

test("CRITICAL (still fixed): no client max_tokens on the registered gemini-2.5-pro spec never collapses the budget to 0", () => {
  const out = requestHighReasoning("gemini-2.5-pro");

  const { thinkingConfig, maxOutputTokens } = out.request.generationConfig;
  assert.ok(thinkingConfig, "thinkingConfig must be present");
  assert.equal(maxOutputTokens, SAFE_DEFAULT_MAX_OUTPUT_TOKENS, "own default is the safe ceiling");
  assert.equal(
    thinkingConfig.thinkingBudget,
    SAFE_DEFAULT_MAX_OUTPUT_TOKENS - headroomFor(SAFE_DEFAULT_MAX_OUTPUT_TOKENS)
  );
  assert.ok(
    thinkingConfig.thinkingBudget < maxOutputTokens,
    `budget must fit strictly within maxOutputTokens (got budget=${thinkingConfig.thinkingBudget}, maxOutputTokens=${maxOutputTokens})`
  );
});

test("REQUIRED: every gemini-cli registry model satisfies budget < maxOutputTokens with reasoning_effort high and no client max_tokens", () => {
  const failures = [];
  for (const model of GEMINI_CLI_MODEL_IDS) {
    const out = requestHighReasoning(model);
    const { thinkingConfig, maxOutputTokens } = out.request.generationConfig;

    if (thinkingConfig === undefined) {
      // Only acceptable when the model genuinely does not support thinking.
      continue;
    }
    const fits = thinkingConfig.thinkingBudget < maxOutputTokens;
    if (!fits) {
      failures.push(
        `${model}: thinkingBudget=${thinkingConfig.thinkingBudget} >= maxOutputTokens=${maxOutputTokens}`
      );
    }
  }

  assert.deepEqual(failures, [], `thinking starves the answer for: ${failures.join("; ")}`);
});

test("REQUIRED: a model with supportsThinking: false never receives thinkingConfig even when reasoning_effort is requested", () => {
  const out = requestHighReasoning("gemini-3.5-flash");

  assert.equal(
    out.request.generationConfig.thinkingConfig,
    undefined,
    "supportsThinking: false must never receive a thinkingConfig"
  );
});

test("HIGH (fixed): reasoning_effort high on gemini-2.5-flash/-flash-lite clamps to their real 24576 cap when there is enough headroom", () => {
  for (const model of ["gemini-2.5-flash", "gemini-2.5-flash-lite"]) {
    const out = requestHighReasoning(model, { max_tokens: 65536 });
    const { thinkingConfig, maxOutputTokens } = out.request.generationConfig;
    assert.equal(maxOutputTokens, 65536);
    assert.equal(
      thinkingConfig.thinkingBudget,
      24576,
      `${model}: high tier must clamp to its declared cap`
    );
  }
});

test("CRITICAL (fixed): Claude-format thinking.budget_tokens: 200000 never produces an invalid maxOutputTokens", () => {
  for (const model of [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3-pro-preview",
  ]) {
    const out = requestGeminiCLI(model, { thinking: { type: "enabled", budget_tokens: 200000 } });
    const { thinkingConfig, maxOutputTokens } = out.request.generationConfig;
    assert.ok(
      maxOutputTokens <= 65536,
      `${model}: maxOutputTokens must never exceed the universal Gemini ceiling, got ${maxOutputTokens}`
    );
    const cap = getModelSpec(model)?.thinkingBudgetCap;
    if (thinkingConfig && typeof cap === "number") {
      assert.ok(
        thinkingConfig.thinkingBudget <= cap,
        `${model}: thinkingBudget ${thinkingConfig.thinkingBudget} must be capped at ${cap}`
      );
    }
    if (thinkingConfig) {
      assert.ok(
        thinkingConfig.thinkingBudget < maxOutputTokens,
        `${model}: thinkingBudget must never reach maxOutputTokens`
      );
    }
  }
});

test("CRITICAL (fixed): an unregistered model degrades safely instead of sizing maxOutputTokens off an unbounded budget", () => {
  const out = requestGeminiCLI("some-unregistered-model-id", {
    reasoning_effort: "high",
    thinking: { type: "enabled", budget_tokens: 200000 },
  });
  const { thinkingConfig, maxOutputTokens } = out.request.generationConfig;
  assert.equal(
    thinkingConfig,
    undefined,
    "unregistered model: no thinkingConfig (supportsThinking is opt-in)"
  );
  assert.equal(
    maxOutputTokens,
    8192,
    "unregistered model: falls back to the generic __default__ cap"
  );
});

test("CRITICAL 4 (fixed): a Pro-family model with max_tokens below its mandatory thinking floor never throws — it omits thinkingConfig", () => {
  assert.doesNotThrow(() => requestHighReasoning("gemini-3.1-pro-high", { max_tokens: 100 }));
  const out = requestHighReasoning("gemini-3.1-pro-high", { max_tokens: 100 });
  const { thinkingConfig, maxOutputTokens } = out.request.generationConfig;
  assert.equal(maxOutputTokens, 100, "client's explicit cap must never be raised");
  assert.equal(
    thinkingConfig,
    undefined,
    "no valid budget fits — degrade by omitting, never throw"
  );
});

test("guard: Flash-Lite model with max_tokens below its enabled-floor safely disables thinking instead of throwing or exceeding the cap", () => {
  const out = requestHighReasoning("gemini-2.5-flash-lite", { max_tokens: 100 });
  const { thinkingConfig, maxOutputTokens } = out.request.generationConfig;
  assert.equal(maxOutputTokens, 100, "client's explicit cap must never be raised");
  assert.ok(thinkingConfig, "thinkingConfig is still sent (with budget disabled to 0)");
  assert.equal(
    thinkingConfig.thinkingBudget,
    0,
    "disabling is safe for a model that CAN disable thinking"
  );
});

test("fitGeminiThinkingBudget unit: Pro model clamps up to its 128 floor when a client GENUINELY requested reasoning and it still fits", () => {
  const fit = fitGeminiThinkingBudget("gemini-3.1-pro-high", 300, 32768, true);
  // headroom = min(8192, 150) = 150; budgetFittingCap = 300 - 150 = 150;
  // floor clamp (genuine client request): max(150, 128) = 150 (already above floor)
  assert.equal(fit.maxOutputTokens, 300);
  assert.equal(fit.thinkingBudgetTokens, 150);
  assert.equal(fit.omitThinkingConfig, false);
});

test("fitGeminiThinkingBudget unit: Pro model never throws when even the mandatory floor doesn't fit under the client's cap — it omits", () => {
  assert.doesNotThrow(() => fitGeminiThinkingBudget("gemini-3.1-pro-high", 100, 32768, true));
  const fit = fitGeminiThinkingBudget("gemini-3.1-pro-high", 100, 32768, true);
  assert.equal(fit.maxOutputTokens, 100);
  assert.equal(fit.thinkingBudgetTokens, 0);
  assert.equal(fit.omitThinkingConfig, true);
});

test("fitGeminiThinkingBudget unit: an INJECTED (non-client-requested) budget that doesn't reach the floor is dropped, not forced up", () => {
  // max_tokens=200: headroom=min(8192,100)=100, naturally-fitted budget=100,
  // which is BELOW the Pro-family 128 floor. With clientRequestedThinking
  // =false (a proxy-injected budget the client never asked for), this must
  // be dropped rather than force-inflated to 128.
  const fit = fitGeminiThinkingBudget("gemini-3.1-pro-high", 200, 32768, false);
  assert.equal(fit.maxOutputTokens, 200);
  assert.equal(fit.thinkingBudgetTokens, 0);
  assert.equal(
    fit.omitThinkingConfig,
    true,
    "Pro family cannot disable, so a sub-floor injected budget is omitted"
  );
});

test("fitGeminiThinkingBudget unit: the SAME inputs with clientRequestedThinking=true clamp up to the floor instead of dropping", () => {
  const fit = fitGeminiThinkingBudget("gemini-3.1-pro-high", 200, 32768, true);
  assert.equal(fit.maxOutputTokens, 200);
  assert.equal(
    fit.thinkingBudgetTokens,
    128,
    "a genuine client ask is honored by clamping up to the mandatory floor"
  );
  assert.equal(fit.omitThinkingConfig, false);
});

test("fitGeminiThinkingBudget unit: Flash-Lite (now registered) clamps up to its 512 floor when the client cap leaves it just enough room", () => {
  // headroom = min(8192, floor(9024/2)) = 4512; budgetFittingCap = 9024-4512 = 4512
  // requestedBudget = min(32768(model cap 24576), 4512) = 4512 already >= 512 floor
  const fit = fitGeminiThinkingBudget("gemini-2.5-flash-lite", 9024, 32768);
  assert.equal(fit.maxOutputTokens, 9024);
  assert.equal(fit.thinkingBudgetTokens, 4512);
  assert.equal(fit.omitThinkingConfig, false);
});

test("fitGeminiThinkingBudget unit: Flash-Lite disables (0) rather than exceeding the cap when there is no headroom at all for the answer", () => {
  const fit = fitGeminiThinkingBudget("gemini-2.5-flash-lite", 100, 32768);
  assert.equal(fit.maxOutputTokens, 100);
  assert.equal(
    fit.thinkingBudgetTokens,
    0,
    "disabling is safe and preferred over exceeding maxOutputTokens"
  );
  assert.equal(fit.omitThinkingConfig, false);
});

test("fitGeminiThinkingBudget unit: no thinking requested (budget <= 0) on a Pro model omits rather than sending an invalid 0", () => {
  const fit = fitGeminiThinkingBudget("gemini-3.1-pro-high", 500, 0);
  assert.equal(fit.thinkingBudgetTokens, 0);
  assert.equal(fit.omitThinkingConfig, true);
});

test("fitGeminiThinkingBudget unit: no thinking requested (budget <= 0) on a Flash model sends an explicit 0, not omitted", () => {
  const fit = fitGeminiThinkingBudget("gemini-2.5-flash", 500, 0);
  assert.equal(fit.thinkingBudgetTokens, 0);
  assert.equal(fit.omitThinkingConfig, false);
});

test("fitGeminiThinkingBudget unit: gemini-3-pro-preview (aliased to gemini-3.1-pro-high) preserves the model's own real cap classification", () => {
  const fit = fitGeminiThinkingBudget("gemini-3-pro-preview", undefined, 32768);
  assert.equal(
    fit.maxOutputTokens,
    SAFE_DEFAULT_MAX_OUTPUT_TOKENS,
    "own default is the safe ceiling, not the raw 65535 cap"
  );
  assert.equal(
    fit.thinkingBudgetTokens,
    SAFE_DEFAULT_MAX_OUTPUT_TOKENS - headroomFor(SAFE_DEFAULT_MAX_OUTPUT_TOKENS)
  );
});

test("fitGeminiThinkingBudget unit: an over-cap raw budget (e.g. Claude's 200000) is clamped by capThinkingBudget before headroom fitting", () => {
  const fit = fitGeminiThinkingBudget("gemini-2.5-flash", undefined, 200000);
  const expectedMaxOut = SAFE_DEFAULT_MAX_OUTPUT_TOKENS;
  const expectedBudget = Math.min(24576, expectedMaxOut - headroomFor(expectedMaxOut));
  assert.equal(
    fit.thinkingBudgetTokens,
    expectedBudget,
    "clamped to the model's declared thinkingBudgetCap"
  );
  assert.ok(fit.thinkingBudgetTokens < fit.maxOutputTokens);
});

test("MEDIUM 7 (fixed): gemini-2.5-flash-lite-preview-06-17 (unregistered but flash-lite-prefixed) inherits the real 512 floor, not the plain-flash 0 floor", () => {
  const fit = fitGeminiThinkingBudget("gemini-2.5-flash-lite-preview-06-17", 9024, 32768);
  assert.equal(
    fit.thinkingBudgetTokens,
    4512,
    "matches gemini-2.5-flash-lite's classification exactly"
  );
});

test("an unknown/unregistered model id produces a valid request (no crash, no invalid maxOutputTokens, no thinkingConfig)", () => {
  const out = requestGeminiCLI("some-completely-unknown-model-id", {
    reasoning_effort: "high",
    max_tokens: 100000,
    thinking: { type: "enabled", budget_tokens: 200000 },
  });
  const { thinkingConfig, maxOutputTokens } = out.request.generationConfig;
  assert.equal(
    thinkingConfig,
    undefined,
    "unregistered model: no thinkingConfig, we cannot vouch for its limits"
  );
  assert.ok(
    Number.isFinite(maxOutputTokens) && maxOutputTokens > 0,
    "maxOutputTokens must be a valid positive number"
  );
  assert.ok(
    maxOutputTokens <= 100000,
    "client's cap must never be raised even for an unknown model"
  );
});

// ─── CRITICAL 2: a global CUSTOM/ADAPTIVE thinking-budget setting never 400s
// (or otherwise breaks) a request that never asked for reasoning ──────────

test("CRITICAL 2 (fixed): mode=custom on a short non-reasoning Gemini call (title-gen style, max_tokens: 50) never throws and never forces an invalid thinkingConfig", () => {
  setThinkingBudgetConfig({
    ...DEFAULT_THINKING_CONFIG,
    mode: ThinkingMode.CUSTOM,
    customBudget: 10240,
  });
  try {
    let out;
    assert.doesNotThrow(() => {
      out = translateRequest(
        FORMATS.OPENAI,
        FORMATS.GEMINI_CLI,
        "gemini-2.5-pro",
        {
          model: "gemini-2.5-pro",
          messages: [{ role: "user", content: "generate a title" }],
          max_tokens: 50,
          stream: false,
        },
        false,
        { accessToken: "t", projectId: "p" },
        "gemini-cli"
      );
    });
    const gc = out.request.generationConfig;
    assert.equal(gc.maxOutputTokens, 50, "client's explicit cap must never be raised");
    // Nothing genuinely asked for reasoning and the injected budget doesn't
    // fit even at the floor within 50 tokens — must degrade silently, never
    // surface as an error.
    assert.equal(gc.thinkingConfig, undefined);
  } finally {
    setThinkingBudgetConfig(DEFAULT_THINKING_CONFIG);
  }
});

test("CRITICAL 2 (fixed): mode=adaptive on a short non-reasoning Gemini call never throws", () => {
  setThinkingBudgetConfig({ ...DEFAULT_THINKING_CONFIG, mode: ThinkingMode.ADAPTIVE });
  try {
    assert.doesNotThrow(() => {
      translateRequest(
        FORMATS.OPENAI,
        FORMATS.GEMINI_CLI,
        "gemini-2.5-pro",
        {
          model: "gemini-2.5-pro",
          messages: [{ role: "user", content: "summarize this" }],
          max_tokens: 100,
          stream: false,
        },
        false,
        { accessToken: "t", projectId: "p" },
        "gemini-cli"
      );
    });
  } finally {
    setThinkingBudgetConfig(DEFAULT_THINKING_CONFIG);
  }
});

test("CRITICAL 2 (fixed): mode=custom with enough max_tokens still gets an injected budget applied (feature preserved)", () => {
  setThinkingBudgetConfig({
    ...DEFAULT_THINKING_CONFIG,
    mode: ThinkingMode.CUSTOM,
    customBudget: 10240,
  });
  try {
    const out = translateRequest(
      FORMATS.OPENAI,
      FORMATS.GEMINI_CLI,
      "gemini-2.5-pro",
      {
        model: "gemini-2.5-pro",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 4096,
        stream: false,
      },
      false,
      { accessToken: "t", projectId: "p" },
      "gemini-cli"
    );
    const gc = out.request.generationConfig;
    assert.equal(gc.maxOutputTokens, 4096);
    assert.ok(
      gc.thinkingConfig,
      "the global CUSTOM setting still applies when there is room for it"
    );
    assert.ok(
      gc.thinkingConfig.thinkingBudget > 0 && gc.thinkingConfig.thinkingBudget < gc.maxOutputTokens
    );
  } finally {
    setThinkingBudgetConfig(DEFAULT_THINKING_CONFIG);
  }
});

// ─── MANDATORY full cross-product (per spec) ───────────────────────────────
// Every gemini-cli registry model x reasoning_effort x max_tokens (including
// the two REAL client defaults, 4096 and 8192) x Claude-format
// thinking.budget_tokens x thinking mode. Runs through the REAL caller chain
// (translateRequest -> openaiToGeminiCLIRequest -> fitGeminiThinkingBudget),
// not a hand-rolled simulation.
test("MANDATORY cross-product: model x reasoning_effort x max_tokens x thinking.budget_tokens x mode never violates a HARD CONSTRAINT and never throws", () => {
  const efforts = ["none", "low", "medium", "high"];
  const maxTokensOptions = [
    undefined,
    0,
    1,
    50,
    100,
    127,
    128,
    129,
    500,
    1024,
    2048,
    4096,
    8192,
    16384,
    32768,
    65536,
    200000,
  ];
  const thinkingBudgetOptions = [undefined, 100, 8192, 32768, 200000];
  const modes = [ThinkingMode.PASSTHROUGH, ThinkingMode.CUSTOM, ThinkingMode.ADAPTIVE];

  const failures = [];
  let checked = 0;

  for (const mode of modes) {
    setThinkingBudgetConfig({ ...DEFAULT_THINKING_CONFIG, mode });
    try {
      for (const model of GEMINI_CLI_MODEL_IDS) {
        const spec = getModelSpec(model);

        for (const effort of efforts) {
          for (const maxTokens of maxTokensOptions) {
            for (const thinkingBudgetTokens of thinkingBudgetOptions) {
              checked++;
              const body = { model, messages: [{ role: "user", content: "hi" }], stream: false };
              if (effort !== "none") body.reasoning_effort = effort;
              if (maxTokens !== undefined) body.max_tokens = maxTokens;
              if (thinkingBudgetTokens !== undefined) {
                body.thinking = { type: "enabled", budget_tokens: thinkingBudgetTokens };
              }

              const label = `mode=${mode} model=${model} effort=${effort} max_tokens=${maxTokens} thinking=${thinkingBudgetTokens}`;

              let out;
              try {
                out = translateRequest(
                  FORMATS.OPENAI,
                  FORMATS.GEMINI_CLI,
                  model,
                  body,
                  false,
                  { accessToken: "t", projectId: "p" },
                  "gemini-cli"
                );
              } catch (err) {
                // HARD CONSTRAINT A: never throw. No exception is acceptable.
                failures.push(`${label}: THREW (must never throw): ${err.message}`);
                continue;
              }

              const gc = out.request.generationConfig;

              // Constraint E: never send thinkingConfig to a
              // supportsThinking:false model.
              if (spec?.supportsThinking === false && gc.thinkingConfig) {
                failures.push(`${label}: thinkingConfig present despite supportsThinking:false`);
              }

              // Constraint B: never raise the client's explicit max_tokens.
              if (maxTokens !== undefined && gc.maxOutputTokens > maxTokens) {
                failures.push(
                  `${label}: maxOutputTokens ${gc.maxOutputTokens} > client max_tokens ${maxTokens} (raised!)`
                );
              }
              // Never exceed the model's own registered ceiling either.
              if (
                typeof spec?.maxOutputTokens === "number" &&
                gc.maxOutputTokens > spec.maxOutputTokens
              ) {
                failures.push(
                  `${label}: maxOutputTokens ${gc.maxOutputTokens} > model real cap ${spec.maxOutputTokens}`
                );
              }
              if (gc.maxOutputTokens > 65536) {
                failures.push(
                  `${label}: maxOutputTokens ${gc.maxOutputTokens} > universal Gemini ceiling 65536`
                );
              }

              if (gc.thinkingConfig) {
                const budget = gc.thinkingConfig.thinkingBudget;

                // Constraint D: never exceed the model's declared thinkingBudgetCap.
                if (
                  typeof spec?.thinkingBudgetCap === "number" &&
                  budget > spec.thinkingBudgetCap
                ) {
                  failures.push(
                    `${label}: thinkingBudget ${budget} > declared cap ${spec.thinkingBudgetCap}`
                  );
                }

                // Constraint C: thinkingBudget must never reach or exceed
                // maxOutputTokens (a budget of exactly 0 against a cap of 0
                // is a degenerate, non-starving case and is exempted).
                if (budget > 0 && budget >= gc.maxOutputTokens) {
                  failures.push(
                    `${label}: thinkingBudget ${budget} >= maxOutputTokens ${gc.maxOutputTokens}`
                  );
                }
              }

              // reasoning_effort: high with a REAL client default max_tokens
              // (>= 4096) on a thinking-capable model must yield a budget
              // meaningfully above the bare 128 floor, never pinned to it.
              // Only checked when there's no COMPETING explicit Claude-format
              // thinking.budget_tokens on the same request — when both are
              // present, the more specific numeric override intentionally
              // wins (see openai-to-gemini.ts), which can legitimately be a
              // small explicit value.
              if (
                effort === "high" &&
                typeof maxTokens === "number" &&
                maxTokens >= 4096 &&
                thinkingBudgetTokens === undefined &&
                spec?.supportsThinking === true
              ) {
                if (!gc.thinkingConfig || gc.thinkingConfig.thinkingBudget <= 128) {
                  failures.push(
                    `${label}: high effort with max_tokens>=4096 must not be pinned to the floor, got ${gc.thinkingConfig?.thinkingBudget}`
                  );
                }
              }

              // A non-reasoning request (no reasoning_effort, no
              // thinking.budget_tokens on the wire) in PASSTHROUGH mode must
              // never gain a thinkingConfig out of nowhere.
              if (
                mode === ThinkingMode.PASSTHROUGH &&
                effort === "none" &&
                thinkingBudgetTokens === undefined
              ) {
                if (gc.thinkingConfig !== undefined) {
                  failures.push(
                    `${label}: non-reasoning passthrough request unexpectedly gained a thinkingConfig`
                  );
                }
              }
            }
          }
        }
      }
    } finally {
      setThinkingBudgetConfig(DEFAULT_THINKING_CONFIG);
    }
  }

  assert.ok(checked > 1000, `must exercise a large cross-product, got ${checked}`);
  assert.deepEqual(
    failures,
    [],
    `${failures.length} invariant violation(s) (showing up to 40):\n${failures.slice(0, 40).join("\n")}`
  );
});
