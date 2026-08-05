import test from "node:test";
import assert from "node:assert/strict";

/**
 * Antigravity model IDs must reach the upstream exactly as `fetchAvailableModels` advertises them.
 *
 * This has been got wrong twice. First by downcasting bare/agent IDs to the `-low` tier, which hid
 * quota errors behind a tier the caller never asked for. Then by mapping `gpt-oss-120b-medium` to a
 * bare `gpt-oss-120b` that upstream does not serve at all — rewriting the only valid ID into a 404.
 *
 * Every Antigravity model carries a tier suffix (`-low`, `-medium`, `-high`, `-extra-low`,
 * `-tiered`). The suffix is part of the name, not noise to strip.
 */

const { getModelInfoCore } = await import("../../open-sse/services/model.ts");
const { OAUTH_PROVIDERS } = await import("../../open-sse/config/registry-providers-oauth.ts");

const LIVE_IDS = [
  "gpt-oss-120b-medium",
  "gemini-3.6-flash-low",
  "gemini-3.6-flash-medium",
  "gemini-3.6-flash-high",
  "gemini-3.5-flash-extra-low",
  "gemini-3.6-flash-tiered",
  "gemini-3.1-pro-low",
  "gemini-3-flash-agent",
  "gemini-pro-agent",
  "claude-sonnet-4-6",
  "claude-opus-4-6-thinking",
];

test("an Antigravity model ID reaches the executor unchanged", async () => {
  for (const id of LIVE_IDS) {
    const resolved = await getModelInfoCore(`antigravity/${id}`, {});
    assert.equal(resolved.provider, "antigravity");
    assert.equal(resolved.model, id, `antigravity/${id} must not be rewritten on the way out`);
  }
});

test("the tier suffix is never stripped — that is what produced the 404", async () => {
  // `gpt-oss-120b-medium` is what upstream advertises; a bare `gpt-oss-120b` does not exist there,
  // so any mapping between them turns a working request into "Requested entity was not found".
  const resolved = await getModelInfoCore("antigravity/gpt-oss-120b-medium", {});
  assert.equal(resolved.model, "gpt-oss-120b-medium");
  assert.notEqual(resolved.model, "gpt-oss-120b");
});

test("the provider ships no static catalogue, so the alias map has nothing to correct", () => {
  // Model discovery is passthrough from `v1internal:fetchAvailableModels`. With no shipped list to
  // disagree with, an alias entry here can only ever contradict the upstream.
  const entry = OAUTH_PROVIDERS.antigravity;
  assert.equal(entry.passthroughModels, true);
  assert.deepEqual(entry.models ?? [], []);
});
