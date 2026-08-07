import test from "node:test";
import assert from "node:assert/strict";

import {
  distributeWeights,
  findModelPrice,
  hasFreeTier,
  isDeprecatedProvider,
  isOauthFreeProvider,
  isPaidSubscriptionProvider,
  isTemplateEligibleConnection,
  resolveFreeTier,
} from "../../src/app/(dashboard)/dashboard/combos/components/combo-template-policies.ts";
import {
  AI_PROVIDERS,
  FREE_PROVIDERS,
  OAUTH_PROVIDERS,
} from "../../src/shared/constants/providers.ts";

const model = (overrides = {}) => ({
  value: "p/m",
  id: "m",
  name: "M",
  providerId: "openai",
  prefix: "openai",
  ...overrides,
});

// ──────────────── Free-tier classification ────────────────

test("tier A is FREE_PROVIDERS minus deprecated", () => {
  assert.strictEqual(isOauthFreeProvider("kiro"), true);
  assert.strictEqual(isOauthFreeProvider("qoder"), true);
  assert.strictEqual(isOauthFreeProvider("gemini-cli"), false, "deprecated must not qualify");
  assert.strictEqual(isDeprecatedProvider("gemini-cli"), true);
  assert.strictEqual(isOauthFreeProvider("openai"), false);
});

test("tier C is exactly the 12 measured hasFree providers", () => {
  const tierC = Object.keys(AI_PROVIDERS).filter(hasFreeTier).sort();
  assert.deepStrictEqual(tierC, [
    "aimlapi",
    "cerebras",
    "cloudflare-ai",
    "gemini",
    "groq",
    "huggingface",
    "longcat",
    "nvidia",
    "pollinations",
    "puter",
    "scaleway",
    "together",
  ]);
});

test("the explicit hasFree:false provider is not tier C", () => {
  assert.strictEqual(hasFreeTier("alibaba"), false);
});

test("the A ∪ C composite is exactly 14 providers", () => {
  const tierA = Object.keys(FREE_PROVIDERS).filter(isOauthFreeProvider);
  const tierC = Object.keys(AI_PROVIDERS).filter(hasFreeTier);
  assert.strictEqual(new Set([...tierA, ...tierC]).size, 14);
});

test("every AI_PROVIDERS id classifies as at most one of free / paid-subscription", () => {
  for (const providerId of Object.keys(AI_PROVIDERS)) {
    const free = isOauthFreeProvider(providerId) || hasFreeTier(providerId);
    const paid = isPaidSubscriptionProvider(providerId);
    assert.ok(!(free && paid), `${providerId} classified as both free and paid-subscription`);
  }
});

test("paid-subscription is OAuth and not free, and excludes deprecated", () => {
  const paid = Object.keys(AI_PROVIDERS).filter(isPaidSubscriptionProvider);
  assert.ok(paid.length > 0, "at least one paid OAuth subscription must exist");
  for (const providerId of paid) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(OAUTH_PROVIDERS, providerId),
      `${providerId} is not an OAuth provider`
    );
    assert.strictEqual(isDeprecatedProvider(providerId), false);
  }
  assert.strictEqual(isPaidSubscriptionProvider("kiro"), false);
  assert.strictEqual(isPaidSubscriptionProvider("openai"), false, "API key is not a subscription");
});

// M10: policy helpers read AI_PROVIDERS, which is wider than the picker universe.
test("ollama-local and cliproxyapi classify despite being outside the picker universe", () => {
  assert.ok(AI_PROVIDERS["ollama-local"], "ollama-local must exist in AI_PROVIDERS");
  assert.ok(AI_PROVIDERS["cliproxyapi"], "cliproxyapi must exist in AI_PROVIDERS");
  assert.strictEqual(isOauthFreeProvider("ollama-local"), false);
  assert.strictEqual(hasFreeTier("ollama-local"), false);
  assert.strictEqual(isPaidSubscriptionProvider("ollama-local"), false);
  assert.strictEqual(isPaidSubscriptionProvider("cliproxyapi"), false);
});

test("resolveFreeTier precedence is A before B before C", () => {
  assert.strictEqual(resolveFreeTier(model({ providerId: "kiro" }), 5), "a", "A wins over price");
  assert.strictEqual(resolveFreeTier(model({ providerId: "openai" }), 0), "b");
  assert.strictEqual(resolveFreeTier(model({ providerId: "groq" }), 1.5), "c");
  assert.strictEqual(resolveFreeTier(model({ providerId: "openai" }), 1.5), null);
});

test("unknown pricing degrades to the tier-C check instead of excluding", () => {
  assert.strictEqual(resolveFreeTier(model({ providerId: "groq" }), null), "c");
  assert.strictEqual(resolveFreeTier(model({ providerId: "kiro" }), null), "a");
  assert.strictEqual(resolveFreeTier(model({ providerId: "openai" }), null), null);
});

// ──────────────── Connection eligibility ────────────────

const connection = (overrides = {}) => ({
  id: "c1",
  provider: "openai",
  credentialsConfigured: true,
  testStatus: "unknown",
  isActive: 1,
  ...overrides,
});

test("testStatus 'unknown' passes — it is the create-time default, not a failure", () => {
  assert.strictEqual(isTemplateEligibleConnection(connection({ testStatus: "unknown" })), true);
  assert.strictEqual(isTemplateEligibleConnection(connection({ testStatus: "success" })), true);
});

test("error status, missing credentials, inactive and deprecated are all excluded", () => {
  assert.strictEqual(isTemplateEligibleConnection(connection({ testStatus: "error" })), false);
  assert.strictEqual(
    isTemplateEligibleConnection(connection({ credentialsConfigured: false })),
    false
  );
  assert.strictEqual(isTemplateEligibleConnection(connection({ isActive: 0 })), false);
  assert.strictEqual(isTemplateEligibleConnection(connection({ isActive: false })), false);
  assert.strictEqual(isTemplateEligibleConnection(connection({ provider: "gemini-cli" })), false);
  assert.strictEqual(isTemplateEligibleConnection(connection({ provider: "" })), false);
});

// ──────────────── Pricing lookup ────────────────

// MIN-11: must agree with ComboFormModal.hasPricingForModel, which is object truthiness.
test("a present row with input 0 yields 0, never null", () => {
  const pricing = { openai: { "gpt-4o": { input: 0, output: 0 } } };
  assert.strictEqual(findModelPrice(model({ id: "gpt-4o" }), pricing, []), 0);
  // The component's predicate for the same input:
  assert.strictEqual(!!pricing["openai"]?.["gpt-4o"], true);
});

test("an absent row yields null", () => {
  assert.strictEqual(findModelPrice(model({ id: "gpt-4o" }), {}, []), null);
});

test("a present row with an unparseable input stays priced and sorts last", () => {
  const pricing = { openai: { "gpt-4o": { input: "n/a" } } };
  assert.strictEqual(
    findModelPrice(model({ id: "gpt-4o" }), pricing, []),
    Number.POSITIVE_INFINITY
  );
});

test("the node candidate fan-out matches hasPricingForModel", () => {
  const nodes = [{ id: "n1", prefix: "mynode", name: "My Node", apiType: "openai" }];
  const byApiType = { openai: { "gpt-4o": { input: 2 } } };
  const byNodeName = { "my node": { "gpt-4o": { input: 3 } } };
  const target = model({ id: "gpt-4o", prefix: "mynode", providerId: "n1" });

  assert.strictEqual(findModelPrice(target, byApiType, nodes), 2);
  assert.strictEqual(findModelPrice(target, byNodeName, nodes), 3);
});

// ──────────────── Weight distribution ────────────────

const weighted = (count) => Array.from({ length: count }, () => ({ weight: 0 }));

for (const count of [1, 2, 3, 7]) {
  test(`distributeWeights sums to exactly 100 for ${count} active models`, () => {
    const out = distributeWeights(weighted(count));
    assert.strictEqual(
      out.reduce((sum, m) => sum + m.weight, 0),
      100
    );
    const base = Math.floor(100 / count);
    assert.strictEqual(out[0].weight, base + (100 - base * count), "remainder goes to the first");
    for (const m of out.slice(1)) assert.strictEqual(m.weight, base);
  });
}

test("disabled entries keep their weight and do not count toward the split", () => {
  const out = distributeWeights([
    { weight: 0 },
    { weight: 42, disabled: true },
    { weight: 0 },
    { weight: 0 },
  ]);
  assert.strictEqual(out[1].weight, 42);
  assert.strictEqual(
    out.filter((m) => !m.disabled).reduce((sum, m) => sum + m.weight, 0),
    100
  );
});

// Regression for the component-scoped `activeIndex` that was never reset between calls.
test("distributeWeights is idempotent — two calls in one tick still sum to 100", () => {
  const input = weighted(3);
  const first = distributeWeights(input);
  const second = distributeWeights(input);
  assert.deepStrictEqual(first, second);
  assert.strictEqual(
    second.reduce((sum, m) => sum + m.weight, 0),
    100
  );
  // And re-distributing an already-distributed list is stable.
  assert.deepStrictEqual(distributeWeights(first), first);
});

test("distributeWeights on an all-disabled list changes nothing", () => {
  const input = [{ weight: 5, disabled: true }];
  assert.deepStrictEqual(distributeWeights(input), input);
});
