import test from "node:test";
import assert from "node:assert/strict";

/**
 * Prose compression for Kiro's conversationState.
 *
 * Kiro was the one inbound shape getting RTK's tool-result filtering and no prose compression at
 * all. The gap was discovered by the characterization goldens, pinned there as current behaviour,
 * and closed here — as a separate engine, so closing it changes nothing for an install that
 * upgrades without opting in.
 */

const { cavemanKiroEngine } =
  await import("../../open-sse/compression/engines/caveman-kiro-engine.ts");
const { applyStackedCompression } = await import("../../open-sse/compression/index.ts");

const PROSE =
  "I would like to please just really actually explain the reason why it is important " +
  "to note that this particular function appears to be broken in a number of ways.";

function ctx(overrides = {}) {
  return {
    provider: "kiro",
    model: "claude-sonnet-4",
    userAgent: "curl/8.0",
    rtkProfile: "full",
    bodyShape: "kiro",
    conversationId: null,
    apiKeyId: null,
    touchedSoFar: new Set(),
    deferredWrites: [],
    ...overrides,
  };
}

function kiroBody() {
  return {
    conversationState: {
      currentMessage: {
        userInputMessage: {
          content: PROSE,
          userInputMessageContext: {
            toolResults: [{ content: [{ text: `TOOL OUTPUT: ${PROSE}` }] }],
          },
        },
      },
      history: [{ userInputMessage: { content: PROSE, userInputMessageContext: {} } }],
    },
  };
}

test("compresses prose in both the current message and the history", () => {
  const body = kiroBody();
  const res = cavemanKiroEngine.apply(body, ctx());

  assert.equal(res.applied, true);
  assert.equal(res.stats.messagesTouched, 2);
  assert.ok(res.bytesAfter < res.bytesBefore);

  const current = body.conversationState.currentMessage.userInputMessage.content;
  assert.ok(!current.includes("I would like to"), "filler removed");
  assert.ok(current.includes("broken"), "substance kept");
  assert.ok(
    !body.conversationState.history[0].userInputMessage.content.includes("I would like to")
  );
});

test("leaves tool results to RTK, exactly as tool roles are skipped elsewhere", () => {
  const body = kiroBody();
  const before =
    body.conversationState.currentMessage.userInputMessage.userInputMessageContext.toolResults[0]
      .content[0].text;

  cavemanKiroEngine.apply(body, ctx());

  assert.equal(
    body.conversationState.currentMessage.userInputMessage.userInputMessageContext.toolResults[0]
      .content[0].text,
    before,
    "tool output is data, not the user's prose"
  );
});

test("declines every shape but Kiro", () => {
  assert.equal(cavemanKiroEngine.supports(ctx({ bodyShape: "kiro" })), true);
  for (const shape of ["openai-chat", "openai-responses", "claude", "unknown"]) {
    assert.equal(cavemanKiroEngine.supports(ctx({ bodyShape: shape })), false, shape);
  }
});

test("reports not-applied on a body with nothing to compress", () => {
  const body = {
    conversationState: { currentMessage: { userInputMessage: { content: "tight" } } },
  };
  const before = JSON.stringify(body);
  const res = cavemanKiroEngine.apply(body, ctx());
  assert.equal(res.applied, false);
  assert.equal(JSON.stringify(body), before);
});

test("handles a malformed conversationState without throwing", () => {
  for (const body of [
    {},
    { conversationState: null },
    { conversationState: {} },
    { conversationState: { history: "not an array" } },
    { conversationState: { currentMessage: {} } },
    { conversationState: { currentMessage: { userInputMessage: { content: 42 } } } },
  ]) {
    assert.doesNotThrow(() => cavemanKiroEngine.apply(body, ctx()));
  }
});

test("is lossy and stays out of the default presets", () => {
  // It removes English filler, exactly like caveman-en, so it is lossy for the same reason.
  assert.equal(cavemanKiroEngine.stage, "lossy");
  assert.equal(cavemanKiroEngine.gateCleared, false);
});

// ── the upgrade promise ──────────────────────────────────────────────────────

test("balanced leaves a Kiro body's prose untouched, as it does today", () => {
  const body = kiroBody();
  const result = applyStackedCompression(body, {
    enabled: true,
    userAgent: "curl/8.0",
    caveman: true,
    cavemanOutputLevel: "off",
    preset: "balanced",
  });

  assert.equal(result.engines["caveman-kiro"], undefined, "not selected by the default preset");
  assert.ok(
    body.conversationState.currentMessage.userInputMessage.content.includes("I would like to"),
    "an install that upgrades sends the identical body"
  );
});

test("aggressive does compress it, which is the point of writing the engine", () => {
  const body = kiroBody();
  const result = applyStackedCompression(body, {
    enabled: true,
    userAgent: "curl/8.0",
    caveman: true,
    cavemanOutputLevel: "off",
    preset: "aggressive",
  });

  assert.equal(result.engines["caveman-kiro"]?.applied, true);
  assert.ok(
    !body.conversationState.currentMessage.userInputMessage.content.includes("I would like to")
  );
});

test("caveman-en still declines Kiro rather than being widened", () => {
  // Widening caveman-en would have changed what every existing Kiro install sends on upgrade,
  // because that engine ships in the default preset.
  const body = kiroBody();
  const result = applyStackedCompression(body, {
    enabled: true,
    userAgent: "curl/8.0",
    caveman: true,
    cavemanOutputLevel: "off",
    preset: "aggressive",
  });
  assert.equal(result.engines["caveman-en"], undefined, "caveman-en declines the Kiro shape");
});
