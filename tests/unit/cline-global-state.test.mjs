/**
 * Cline's globalState.json.
 *
 * Cline stores the OpenAI-compatible model id once per mode. Writing a single shared
 * `openAiModelId` — a key Cline has no reader for — configured Plan mode and left Act mode
 * with no model, which shows up as a working Plan run followed by a failing Act run rather
 * than as an error at configure time.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { applyRoutiformClineState, removeRoutiformClineState } =
  await import("../../src/shared/services/clineGlobalState.ts");

const INPUT = { baseUrl: "http://127.0.0.1:20128/v1", model: "cx/gpt-5.4" };

test("both modes get the model id", () => {
  const state = applyRoutiformClineState(null, INPUT);
  assert.equal(state.actModeOpenAiModelId, "cx/gpt-5.4");
  assert.equal(state.planModeOpenAiModelId, "cx/gpt-5.4");
});

test("the key Cline never reads is not written", () => {
  assert.equal(applyRoutiformClineState(null, INPUT).openAiModelId, undefined);
});

test("a stale key from an earlier version is cleared on apply", () => {
  const state = applyRoutiformClineState({ openAiModelId: "cx/gpt-5.3" }, INPUT);
  assert.equal(state.openAiModelId, undefined);
});

test("both modes are switched to the OpenAI-compatible provider", () => {
  const state = applyRoutiformClineState(null, INPUT);
  assert.equal(state.actModeApiProvider, "openai");
  assert.equal(state.planModeApiProvider, "openai");
});

test("the base url drops /v1, which the SDK appends itself", () => {
  assert.equal(applyRoutiformClineState(null, INPUT).openAiBaseUrl, "http://127.0.0.1:20128");
  assert.equal(
    applyRoutiformClineState(null, { ...INPUT, baseUrl: "http://127.0.0.1:20128" }).openAiBaseUrl,
    "http://127.0.0.1:20128"
  );
});

test("unrelated state is carried through", () => {
  const state = applyRoutiformClineState({ telemetrySetting: "off" }, INPUT);
  assert.equal(state.telemetrySetting, "off");
});

test("reset unwinds both modes and every model key", () => {
  const state = removeRoutiformClineState(applyRoutiformClineState(null, INPUT));

  assert.equal(state.actModeApiProvider, "cline");
  assert.equal(state.planModeApiProvider, "cline");
  assert.equal(state.openAiBaseUrl, undefined);
  assert.equal(state.actModeOpenAiModelId, undefined);
  assert.equal(state.planModeOpenAiModelId, undefined);
});

test("reset leaves a state the user has since pointed elsewhere", () => {
  const foreign = { actModeApiProvider: "anthropic", planModeApiProvider: "anthropic" };
  assert.deepEqual(removeRoutiformClineState(foreign), foreign);
});
