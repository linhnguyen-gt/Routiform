import test from "node:test";
import assert from "node:assert/strict";

/**
 * The /api/compression handlers, exercised rather than assumed.
 *
 * The route shipped with tests for the selection helper it calls and none for the handlers
 * themselves, which is the gap where a wrong status code or a swallowed validation error lives.
 */

const localDb = await import("../../src/lib/localDb.ts");
const { GET, PATCH } = await import("../../src/app/api/compression/route.ts");
const { CATALOG_ENGINE_IDS } = await import("../../open-sse/compression/engine-catalog.ts");

const patchRequest = (body) =>
  new Request("http://localhost/api/compression", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

async function readJson(response) {
  return { status: response.status, body: await response.json() };
}

test.beforeEach(async () => {
  // `null` rather than `undefined`: null is a stored "no value chosen", which is what
  // resolvePreset treats as absent. undefined used to crash the writer outright.
  await localDb.updateSettings({
    contextValidation: "auto-compress",
    compressionPreset: null,
    compressionEngines: null,
  });
});

test("GET reports the engines, the presets and which are active", async () => {
  const { status, body } = await readJson(await GET());

  assert.equal(status, 200);
  assert.deepEqual(
    body.engines.map((e) => e.id),
    CATALOG_ENGINE_IDS
  );
  assert.deepEqual(body.presets, ["off", "safe", "balanced", "aggressive", "custom"]);
  assert.equal(body.defaultPreset, "balanced");
  assert.equal(body.header, "X-Routiform-Compression");
  assert.equal(body.overrideHeader, "X-Routiform-Compression-Mode");
});

test("an unconfigured install reports balanced, with exactly today's engines active", async () => {
  const { body } = await readJson(await GET());

  assert.equal(body.preset, "balanced");
  assert.deepEqual(
    body.engines.filter((e) => e.active).map((e) => e.id),
    ["rtk", "caveman-en"],
    "an upgrade must not silently activate anything new"
  );
});

test("every engine carries its gate flag and a summary, so the UI can explain a disabled one", async () => {
  const { body } = await readJson(await GET());

  for (const engine of body.engines) {
    assert.equal(typeof engine.gateCleared, "boolean", engine.id);
    assert.ok(engine.summary?.length > 20, `${engine.id} has no usable summary`);
  }
  assert.ok(
    body.engines.some((e) => !e.gateCleared),
    "the unmeasured engines must be visible, not omitted"
  );
});

test("evalScore is null rather than zero when nothing has been measured", async () => {
  const { body } = await readJson(await GET());

  for (const engine of body.engines) {
    // 0 would read as "measured, and scored nothing" — a different and much worse claim.
    assert.equal(engine.evalScore, null, engine.id);
    assert.equal(engine.evalRunAt, null, engine.id);
  }
});

test("GET reflects compression being switched off entirely", async () => {
  await localDb.updateSettings({ contextValidation: "passthrough" });
  const { body } = await readJson(await GET());

  assert.equal(body.enabled, false);
  assert.equal(body.preset, "off");
  assert.deepEqual(
    body.engines.filter((e) => e.active),
    []
  );
});

test("PATCH sets the preset and GET sees it immediately", async () => {
  const patched = await readJson(await PATCH(patchRequest({ preset: "safe" })));
  assert.equal(patched.status, 200);
  assert.equal(patched.body.preset, "safe");

  // The reader caches for 4s; without invalidation the caller would see its own write not land.
  const { body } = await readJson(await GET());
  assert.equal(body.preset, "safe");
  assert.deepEqual(
    body.engines.filter((e) => e.active).map((e) => e.id),
    ["rtk"]
  );
});

test("PATCH sets per-engine toggles for the custom preset", async () => {
  await PATCH(patchRequest({ preset: "custom", engines: { lite: true, rtk: true } }));
  const { body } = await readJson(await GET());

  assert.equal(body.preset, "custom");
  assert.deepEqual(
    body.engines.filter((e) => e.active).map((e) => e.id),
    ["lite", "rtk"]
  );
});

test("PATCH rejects an unknown preset instead of storing it", async () => {
  const { status } = await readJson(await PATCH(patchRequest({ preset: "turbo" })));
  assert.equal(status, 400);

  const { body } = await readJson(await GET());
  assert.equal(body.preset, "balanced", "the bad value was not persisted");
});

test("PATCH rejects a malformed engines map", async () => {
  const { status } = await readJson(await PATCH(patchRequest({ engines: { lite: "yes" } })));
  assert.equal(status, 400);
});

test("PATCH with nothing to change is a 400, not a silent success", async () => {
  const { status, body } = await readJson(await PATCH(patchRequest({})));
  assert.equal(status, 400);
  assert.equal(body.error.code, "NOTHING_TO_UPDATE");
});

test("PATCH with an unparseable body fails as a server-handled error, not a crash", async () => {
  const request = new Request("http://localhost/api/compression", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: "{not json",
  });
  const response = await PATCH(request);
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error.code, "COMPRESSION_UPDATE_FAILED");
});

test("both handlers forbid caching, since the answer changes with settings", async () => {
  const get = await GET();
  assert.match(get.headers.get("cache-control") ?? "", /no-store/);

  const patch = await PATCH(patchRequest({ preset: "balanced" }));
  assert.match(patch.headers.get("cache-control") ?? "", /no-store/);
});
