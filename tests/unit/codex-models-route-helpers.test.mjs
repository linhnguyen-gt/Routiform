import test from "node:test";
import assert from "node:assert/strict";

const { normalizeCodexModelsBaseUrl, buildCodexModelsEndpoints, mapCodexModelsFromApi } =
  await import("../../src/app/api/providers/[id]/models/route.ts");

test("codex models helper normalizes responses base url", () => {
  assert.equal(
    normalizeCodexModelsBaseUrl("https://chatgpt.com/backend-api/codex/responses"),
    "https://chatgpt.com/backend-api/codex"
  );
  assert.equal(
    normalizeCodexModelsBaseUrl("https://chatgpt.com/backend-api/codex/"),
    "https://chatgpt.com/backend-api/codex"
  );
});

test("codex models helper builds unique endpoint candidates", () => {
  const endpoints = buildCodexModelsEndpoints("https://chatgpt.com/backend-api/codex");
  assert.deepEqual(endpoints, [
    "https://chatgpt.com/backend-api/codex/models",
    "https://chatgpt.com/backend-api/codex/v1/models",
    "https://chatgpt.com/backend-api/codex/api/codex/models",
  ]);
});

test("codex models helper maps API payload and hides non-list entries", () => {
  const payload = {
    models: [
      { slug: "gpt-5.4", display_name: "gpt-5.4", visibility: "list" },
      { slug: "gpt-oss-120b", display_name: "gpt-oss-120b", visibility: "list" },
      { slug: "hidden-model", display_name: "Hidden", visibility: "hidden" },
    ],
  };

  const visible = mapCodexModelsFromApi(payload, false);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, "gpt-5.4");
  assert.equal(visible[0].name, "gpt-5.4");
  assert.equal(visible[0].hidden, false);
  assert.equal(
    visible.some((m) => m.id === "gpt-oss-120b"),
    false
  );

  const all = mapCodexModelsFromApi(payload, true);
  assert.equal(all.length, 2);
  assert.equal(
    all.some((m) => m.id === "gpt-oss-120b"),
    false
  );
  assert.equal(all[1].id, "hidden-model");
  assert.equal(all[1].hidden, true);
});
