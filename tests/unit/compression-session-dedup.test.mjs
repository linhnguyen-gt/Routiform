import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { sessionDedupEngine, setDedupStore, getDedupStore } =
  await import("../../open-sse/compression/engines/session-dedup.ts");
const { MemoryDedupStore } =
  await import("../../open-sse/compression/engines/memory-dedup-store.ts");
const { DEDUP_TTL_MS } = await import("../../open-sse/compression/engines/dedup-store.ts");

let clock = 1_700_000_000_000;
let store;

function freshStore() {
  clock = 1_700_000_000_000;
  store = new MemoryDedupStore(() => clock);
  setDedupStore(store);
  return store;
}

function ctx(overrides = {}) {
  return {
    provider: "anthropic",
    model: "claude-sonnet-4",
    userAgent: "claude-cli/1.0",
    rtkProfile: "safe",
    bodyShape: "openai-chat",
    conversationId: "conv-1",
    apiKeyId: "key-A",
    touchedSoFar: new Set(),
    deferredWrites: [],
    ...overrides,
  };
}

/** A tool payload comfortably over the 2KB threshold. */
const bigBlock = (tag = "alpha") =>
  `FILE CONTENTS ${tag}\n` +
  Array.from({ length: 200 }, (_, i) => `line ${i} of ${tag}`).join("\n");

const bodyWith = (content) => ({ messages: [{ role: "tool", tool_call_id: "t1", content }] });

/** Run apply, then run whatever it staged — i.e. simulate a request that succeeded. */
function applyAndCommit(body, c = ctx()) {
  const res = sessionDedupEngine.apply(body, c);
  for (const write of c.deferredWrites) write.commit();
  return res;
}

test.beforeEach(() => freshStore());

test("first sighting emits no marker and stores nothing until the request succeeds", () => {
  const body = bodyWith(bigBlock());
  const c = ctx();
  const res = sessionDedupEngine.apply(body, c);

  assert.equal(res.applied, false);
  assert.equal(res.stats.misses, 1);
  assert.ok(body.messages[0].content.startsWith("FILE CONTENTS"), "full content still sent");
  assert.equal(store.size(), 0, "apply() must not write");

  assert.equal(c.deferredWrites.length, 1);
  c.deferredWrites[0].commit();
  assert.equal(store.size(), 1, "stored only after the commit ran");
});

test("a repeat sighting in the same conversation is replaced by a marker", () => {
  const content = bigBlock();
  applyAndCommit(bodyWith(content));

  const body = bodyWith(content);
  const res = sessionDedupEngine.apply(body, ctx());

  assert.equal(res.applied, true);
  assert.equal(res.stats.hits, 1);
  assert.ok(res.bytesAfter < res.bytesBefore);
  assert.ok(body.messages[0].content.startsWith("<routiform:deduped"));
  assert.ok(body.messages[0].content.includes("already sent earlier in this conversation"));
});

// ── the retry-poisoning case ─────────────────────────────────────────────────

test("a failed attempt stores nothing, so the retry re-sends the full block", () => {
  // applyStackedCompression runs per attempt. If apply() wrote to the store, attempt 1 would
  // record the block, attempt 2 would find a hit, and the model would be handed a reference to
  // content no upstream ever received.
  const content = bigBlock();

  const attempt1 = ctx();
  sessionDedupEngine.apply(bodyWith(content), attempt1);
  // Attempt 1 fails: its deferred writes are simply never run.

  const attempt2 = ctx();
  const body = bodyWith(content);
  const res = sessionDedupEngine.apply(body, attempt2);

  assert.equal(res.applied, false, "no marker for content that was never delivered");
  assert.ok(body.messages[0].content.startsWith("FILE CONTENTS"));
  assert.equal(store.size(), 0);
});

test("three attempts then success commits each block exactly once", () => {
  const content = bigBlock();
  const contexts = [ctx(), ctx(), ctx()];
  for (const c of contexts) sessionDedupEngine.apply(bodyWith(content), c);

  // Only the surviving attempt commits.
  for (const write of contexts[2].deferredWrites) write.commit();

  assert.equal(store.size(), 1, "one row per distinct block, not one per attempt");
});

// ── isolation ────────────────────────────────────────────────────────────────

test("a different conversation does not see the block", () => {
  const content = bigBlock();
  applyAndCommit(bodyWith(content), ctx({ conversationId: "conv-1" }));

  const body = bodyWith(content);
  const res = sessionDedupEngine.apply(body, ctx({ conversationId: "conv-2" }));

  assert.equal(res.applied, false);
  assert.ok(body.messages[0].content.startsWith("FILE CONTENTS"));
});

test("a different tenant does not see the block, even in the same conversation id", () => {
  // The cross-tenant leak this key exists to prevent: without api_key_id, tenant A's send
  // suppresses tenant B's identical block and B's model gets a reference to content it never had.
  const content = bigBlock();
  applyAndCommit(bodyWith(content), ctx({ apiKeyId: "key-A", conversationId: "shared" }));

  const body = bodyWith(content);
  const res = sessionDedupEngine.apply(body, ctx({ apiKeyId: "key-B", conversationId: "shared" }));

  assert.equal(res.applied, false, "tenant B must not be deduped against tenant A's block");
  assert.ok(body.messages[0].content.startsWith("FILE CONTENTS"));
});

test("supports() is false without either identity", () => {
  assert.equal(sessionDedupEngine.supports(ctx()), true);
  assert.equal(sessionDedupEngine.supports(ctx({ conversationId: null })), false);
  assert.equal(sessionDedupEngine.supports(ctx({ apiKeyId: null })), false);
  assert.equal(sessionDedupEngine.supports(ctx({ apiKeyId: null, conversationId: null })), false);
});

test("apply() is inert when an identity is missing, even if called directly", () => {
  // supports() already gates this, but an engine whose apply() depends on the gate having run is
  // one refactor away from a cross-tenant key built from undefined.
  const body = bodyWith(bigBlock());
  const before = JSON.stringify(body);
  const res = sessionDedupEngine.apply(body, ctx({ apiKeyId: null }));
  assert.equal(res.applied, false);
  assert.equal(JSON.stringify(body), before);
  assert.equal(store.size(), 0);
});

// ── the deleted fallback ─────────────────────────────────────────────────────

test("no prompt-prefix fallback exists anywhere in the engine", () => {
  // The rejected design derived a key from analyzePrefix's prefix hash. For coding agents that
  // hash is identical across every conversation sharing a system prompt, and on Anthropic-shaped
  // bodies it degenerates to sha256("") for everyone. Grep-asserted so it cannot creep back.
  const source = fs.readFileSync("open-sse/compression/engines/session-dedup.ts", "utf8");
  assert.ok(!source.includes("prefixAnalyzer"), "must not import the prefix analyzer");
  assert.ok(!source.includes("analyzePrefix"));
  // Banning the WORD would also ban the comment explaining why there is no fallback, so the
  // structural assertion is the import; the behavioural proof is the next test.
  assert.ok(!/promptCache/.test(source), "must not reach into the prompt-cache module at all");
});

test("two conversations sharing a system prompt do not share a dedup key", () => {
  const content = bigBlock();
  const system = "You are a coding agent with a very long standard system prompt.";

  const first = {
    messages: [
      { role: "system", content: system },
      { role: "tool", content },
    ],
  };
  applyAndCommit(first, ctx({ conversationId: "conv-1" }));

  const second = {
    messages: [
      { role: "system", content: system },
      { role: "tool", content },
    ],
  };
  const res = sessionDedupEngine.apply(second, ctx({ conversationId: "conv-2" }));

  assert.equal(res.applied, false);
});

test("a Claude-shaped body with a top-level system field produces no shared key", () => {
  const content = bigBlock();
  const body = {
    system: "top-level system, not a message",
    messages: [{ role: "user", content: [{ type: "tool_result", tool_use_id: "t", content }] }],
  };
  // Without a conversation id there is simply no key — not an empty one, not a global one.
  assert.equal(
    sessionDedupEngine.supports(ctx({ bodyShape: "claude", conversationId: null })),
    false
  );

  const res = applyAndCommit(body, ctx({ bodyShape: "claude" }));
  assert.equal(res.applied, false, "first sighting");
  assert.equal(store.size(), 1, "keyed by the explicit conversation id, nothing derived");
});

// ── thresholds, TTL, misses ──────────────────────────────────────────────────

test("a block below the size threshold is never deduped", () => {
  const small = "x".repeat(1024);
  applyAndCommit(bodyWith(small));
  const body = bodyWith(small);
  const res = sessionDedupEngine.apply(body, ctx());
  assert.equal(res.applied, false);
  assert.equal(store.size(), 0, "not even stored — a 1KB block is not worth a lookup");
});

test("a store cleared between turns re-sends the full block rather than dangling", () => {
  const content = bigBlock();
  applyAndCommit(bodyWith(content));
  store.clear();

  const body = bodyWith(content);
  const res = sessionDedupEngine.apply(body, ctx());
  assert.equal(res.applied, false);
  assert.ok(body.messages[0].content.startsWith("FILE CONTENTS"));
});

test("entries past the TTL stop producing markers", () => {
  const content = bigBlock();
  applyAndCommit(bodyWith(content));
  assert.equal(store.size(), 1);

  clock += DEDUP_TTL_MS + 1000;
  store.sweep(DEDUP_TTL_MS);
  assert.equal(store.size(), 0);

  const body = bodyWith(content);
  assert.equal(sessionDedupEngine.apply(body, ctx()).applied, false);
});

test("touch keeps an actively referenced block alive", () => {
  const content = bigBlock();
  applyAndCommit(bodyWith(content));

  clock += DEDUP_TTL_MS / 2;
  sessionDedupEngine.apply(bodyWith(content), ctx()); // hit → touch

  clock += DEDUP_TTL_MS / 2 + 1000;
  store.sweep(DEDUP_TTL_MS);
  assert.equal(store.size(), 1, "recency was refreshed by the hit");
});

test("distinct blocks in one turn are keyed separately", () => {
  const body = {
    messages: [
      { role: "tool", content: bigBlock("alpha") },
      { role: "tool", content: bigBlock("beta") },
    ],
  };
  applyAndCommit(body);
  assert.equal(store.size(), 2);

  const second = {
    messages: [
      { role: "tool", content: bigBlock("alpha") },
      { role: "tool", content: bigBlock("gamma") },
    ],
  };
  const res = sessionDedupEngine.apply(second, ctx());
  assert.equal(res.stats.hits, 1);
  assert.equal(res.stats.misses, 1);
  assert.ok(second.messages[0].content.startsWith("<routiform:deduped"));
  assert.ok(second.messages[1].content.startsWith("FILE CONTENTS"));
});

test("an already-deduped marker is not re-deduped", () => {
  const content = bigBlock();
  applyAndCommit(bodyWith(content));
  const body = bodyWith(content);
  sessionDedupEngine.apply(body, ctx());
  const marker = body.messages[0].content;

  const res = sessionDedupEngine.apply(body, ctx());
  assert.equal(res.applied, false);
  assert.equal(body.messages[0].content, marker);
});

test("prose is never deduped, only tool output", () => {
  const content = bigBlock();
  const body = { messages: [{ role: "user", content }] };
  applyAndCommit(body);
  applyAndCommit({ messages: [{ role: "user", content }] });
  assert.equal(store.size(), 0, "a user message is not a candidate");
});

test("an is_error tool_result is left alone", () => {
  const content = bigBlock();
  const make = () => ({
    messages: [
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t", is_error: true, content }],
      },
    ],
  });
  applyAndCommit(make(), ctx({ bodyShape: "claude" }));
  assert.equal(store.size(), 0);
});

test("hit rate is reported for the instrumentation the threshold will be tuned from", () => {
  const content = bigBlock();
  applyAndCommit(bodyWith(content));
  const res = sessionDedupEngine.apply(bodyWith(content), ctx());
  assert.equal(res.stats.hits, 1);
  assert.equal(res.stats.misses, 0);
  assert.equal(res.stats.hitRate, 1);
});

test("ships out of every default preset", () => {
  assert.equal(sessionDedupEngine.gateCleared, false);
  assert.equal(sessionDedupEngine.stage, "lossless");
});

test("the store is swappable, which is how production gets SQLite", () => {
  const replacement = new MemoryDedupStore();
  setDedupStore(replacement);
  assert.equal(getDedupStore(), replacement);
  freshStore();
});
