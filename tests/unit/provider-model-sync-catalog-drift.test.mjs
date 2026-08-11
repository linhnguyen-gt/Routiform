/**
 * The built-in model registry is hand-maintained while each provider's own catalog moves
 * under it, so an id can outlive the model it names. Nothing noticed until a request came
 * back 404 or 410 — by which point the model had been sitting in the pickers, and in the
 * batch model test, failing every time. Twelve of NVIDIA's seventeen built-in entries were
 * in that state, including the `meta/llama-4-maverick` that answered 410 Gone.
 *
 * Model sync now names the drift on every run. It never removes anything: several providers
 * list per account rather than per catalogue, and some handlers answer 200 from a local
 * fallback when upstream is down, so an absence is evidence for a human rather than a fact
 * to act on.
 */

import test from "node:test";
import assert from "node:assert/strict";

const { findRetiredRegistryModels, PARTIAL_MODEL_LISTING_PROVIDERS } =
  await import("../../src/app/api/providers/[id]/sync-models/retired-registry-models.ts");
const { getModelsByProviderId } = await import("../../src/shared/constants/models.ts");

test("registry ids missing from the provider's listing are reported", () => {
  const retired = findRetiredRegistryModels({
    registryIds: ["alive-1", "gone-1", "alive-2", "alive-3"],
    listedModels: [{ id: "alive-1" }, { id: "alive-2" }, { id: "alive-3" }, { id: "extra" }],
  });
  assert.deepEqual(retired, ["gone-1"]);
});

test("providers whose listing is known to be partial are never reported on", () => {
  const retired = findRetiredRegistryModels({
    registryIds: ["a", "b"],
    listedModels: [{ id: "a" }],
    skip: true,
  });
  assert.deepEqual(retired, []);
});

test("the curated and fallback-backed providers are on that list", () => {
  // qoder ships two ids as a deliberate fallback its live catalog replaces, and its listing
  // also omits models flagged disabled that still serve chat.
  for (const provider of ["github", "kiro", "qoder"]) {
    assert.equal(PARTIAL_MODEL_LISTING_PROVIDERS.has(provider), true, provider);
  }
});

test("an empty or unusable listing retires nothing", () => {
  const registryIds = ["a", "b"];
  assert.deepEqual(findRetiredRegistryModels({ registryIds, listedModels: [] }), []);
  assert.deepEqual(
    findRetiredRegistryModels({ registryIds, listedModels: [null, "nope", { name: 7 }] }),
    []
  );
});

test("a listing that names models by `name` or `model` still counts them as present", () => {
  const retired = findRetiredRegistryModels({
    registryIds: ["a", "b", "c", "d"],
    listedModels: [{ name: "a" }, { model: "b" }, { id: "c" }],
  });
  assert.deepEqual(retired, ["d"]);
});

test("ids are compared without regard to case", () => {
  const retired = findRetiredRegistryModels({
    registryIds: ["Qwen/Qwen3-32B", "meta/Llama-3.3-70B"],
    listedModels: [{ id: "qwen/qwen3-32b" }, { id: "meta/llama-3.3-70b" }],
  });
  assert.deepEqual(retired, []);
});

test("a whole registry going missing reads as a naming mismatch, not a mass retirement", () => {
  // Two catalogues that disagree about how ids are spelled would otherwise report every
  // model as withdrawn and send someone deleting a working provider's entire catalog.
  const retired = findRetiredRegistryModels({
    registryIds: ["a", "b", "c", "d"],
    listedModels: [{ id: "vendor::a" }, { id: "vendor::b" }],
  });
  assert.deepEqual(retired, []);
});

test("the NVIDIA registry no longer offers models NVIDIA has withdrawn", () => {
  // Verified against https://integrate.api.nvidia.com/v1/models — each of these was in the
  // built-in list and absent from the live catalog. Sync now names drift like this on every
  // run, so this list should not need to grow by hand again.
  const withdrawn = [
    "gpt-oss-120b",
    "meta/llama-4-maverick-17b-128e-instruct",
    "moonshotai/kimi-k2.5",
    "z-ai/glm4.7",
    "deepseek-ai/deepseek-v3.2",
    "deepseek-ai/deepseek-v4-pro",
    "deepseek-ai/deepseek-v4-flash",
    "deepseek/deepseek-r1",
    "nvidia/llama-3.3-70b-instruct",
    "nvidia/nemotron-3-ultra-550b",
    "nvidia/llama-3.1-70b-instruct",
    "nvidia/llama-3.1-405b-instruct",
  ];
  const offered = new Set(getModelsByProviderId("nvidia").map((m) => m.id));
  for (const id of withdrawn) {
    assert.equal(offered.has(id), false, `${id} is no longer served by NVIDIA`);
  }
  assert.ok(offered.size > 0, "the provider must still offer its live models");
});
