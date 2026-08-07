import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-combo-save-validation-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const combosDb = await import("../../src/lib/db/combos.ts");
const collectionRoute = await import("../../src/app/api/combos/route.ts");
const itemRoute = await import("../../src/app/api/combos/[id]/route.ts");

function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.beforeEach(() => {
  resetStorage();
});

test.after(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

const post = (body) =>
  collectionRoute.POST(
    new Request("http://localhost/api/combos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );

const put = (id, body) =>
  itemRoute.PUT(
    new Request(`http://localhost/api/combos/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );

const create = (name, models, extra = {}) => ({
  name,
  models,
  strategy: "priority",
  config: {},
  ...extra,
});

// ──────────────── POST ────────────────

test("POST rejects an entry whose provider resolves nowhere", async () => {
  const res = await post(create("bad-combo", ["foo/bar/baz"]));
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(typeof body.error === "string" && body.error.length > 0);
});

test("POST saves an out-of-catalog model with exactly one warning", async () => {
  const res = await post(create("warned-combo", ["groq/llama-3.1-70b-versatile"]));
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.strictEqual(body.warnings.length, 1);
  assert.ok(body.id, "the body must stay the bare record — bin/cli/combo.mjs reads data.id");
});

test("POST with only valid models returns no warnings key at all", async () => {
  const res = await post(create("clean-combo", ["nvidia/meta/llama-3.3-70b-instruct"]));
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.ok(!("warnings" in body), "the key must be absent, not an empty array");
});

test("a programmatically generated auto-combo payload round-trips", async () => {
  const res = await post({
    name: "auto-generated",
    models: [
      { model: "nvidia/meta/llama-3.3-70b-instruct", weight: 50 },
      { model: "openrouter/anything/at-all", weight: 50 },
    ],
    strategy: "weighted",
    config: { maxRetries: 2, retryDelayMs: 1000, healthCheckEnabled: true },
  });
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.ok(!("warnings" in body));
});

test("GET /api/combos never carries warnings after a warned create", async () => {
  const created = await post(create("warned-combo", ["groq/llama-3.1-70b-versatile"]));
  assert.strictEqual(created.status, 201);

  const res = await collectionRoute.GET();
  const body = await res.json();
  assert.strictEqual(body.combos.length, 1);
  assert.ok(!("warnings" in body.combos[0]), "warnings must never be persisted");
});

// ──────────────── PUT ────────────────

test("PUT with no models key performs no model validation", async () => {
  const stored = await combosDb.createCombo(create("legacy", ["if/kimi-k2-thinking"]));

  // handleToggleCombo and MCPDashboard send exactly this and never check res.ok.
  const res = await put(stored.id, { isActive: false });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(!("warnings" in body));
});

test("renaming a combo with a pre-existing bad entry warns instead of failing", async () => {
  const stored = await combosDb.createCombo(create("legacy", ["if/kimi-k2-thinking"]));

  const res = await put(stored.id, { name: "legacy-renamed", models: ["if/kimi-k2-thinking"] });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.warnings.length, 1);
});

test("PUT still rejects a newly introduced bad entry", async () => {
  const stored = await combosDb.createCombo(
    create("editable", ["nvidia/meta/llama-3.3-70b-instruct"])
  );

  const res = await put(stored.id, { models: ["foo/bar/baz"] });
  assert.strictEqual(res.status, 400);
});

// ──────────────── Fail open ────────────────

test("a provider-node read failure skips validation and still saves", async () => {
  // A genuine read failure rather than a mock: without provider nodes we cannot tell a
  // custom-node prefix from a typo, and a transient SQLite problem must not block a save.
  core.getDbInstance().prepare("DROP TABLE provider_nodes").run();

  const res = await post(create("fail-open", ["foo/bar/baz"]));
  assert.strictEqual(res.status, 201, "must save despite an unresolvable prefix");
  const body = await res.json();
  assert.ok(!("warnings" in body), "a skipped pass produces no warnings either");
});

test("a custom provider-node prefix saves cleanly", async () => {
  const providersDb = await import("../../src/lib/db/providers.ts");
  await providersDb.createProviderNode({
    name: "My Node",
    prefix: "mynode",
    type: "openai-compatible",
    baseUrl: "http://localhost:1234/v1",
  });

  const res = await post(create("node-combo", ["mynode/gpt-4o"]));
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.ok(!("warnings" in body), "the router resolves this prefix; the save must not warn");
});

test("a nested combo referenced by name saves, before and after the split", async () => {
  const inner = await post(create("team/fast", ["nvidia/meta/llama-3.3-70b-instruct"]));
  assert.strictEqual(inner.status, 201);

  const outer = await post(create("outer", ["team/fast"]));
  assert.strictEqual(outer.status, 201);
  const body = await outer.json();
  assert.ok(!("warnings" in body), "a combo name must never be read as provider/model");
});

// Deliberate behaviour change, not an oversight. `validateComboDAG` ignores references to
// combos that do not exist yet, so this used to save a combo the router could not resolve.
// Nothing distinguishes a future combo name from a typo — both fail all three resolution
// sources — and rejecting the typo is the point of the check. Create the inner combo first.
test("a slash-bearing reference to a combo that does not exist yet is rejected", async () => {
  const res = await post(create("outer", ["team/fast"]));
  assert.strictEqual(res.status, 400);
});
