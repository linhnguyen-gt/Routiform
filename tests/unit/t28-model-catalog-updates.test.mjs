import test from "node:test";
import assert from "node:assert/strict";

import { getModelInfoCore } from "../../open-sse/services/model.ts";
import { REGISTRY } from "../../open-sse/config/providerRegistry.ts";
import { getStaticModelsForProvider } from "../../src/app/api/providers/[id]/models/route.ts";

test("T28: gemini-cli catalog includes preview models, gemini uses API sync", () => {
  // Gemini (AI Studio) no longer has a hardcoded registry — models come from
  // API sync via /api/providers/:id/models with pageSize=1000.
  const geminiIds = REGISTRY.gemini.models.map((m) => m.id);
  assert.equal(geminiIds.length, 0, "gemini models should be empty (populated by API sync)");

  // gemini-cli still has hardcoded models (Cloud Code doesn't have a models API).
  // This used to assert on "gemini-3.1-flash-lite-preview", which pinned a model
  // Google shut down 2026-05-25 into the catalog — the assertion was keeping a
  // dead id alive. It now checks the live successor. See
  // tests/unit/model-family-fallback-no-dead-models.test.mjs for the guard that
  // rejects any shut-down id in any registry.
  const geminiCliIds = REGISTRY["gemini-cli"].models.map((m) => m.id);
  assert.ok(geminiCliIds.includes("gemini-3.1-flash-lite"));
  assert.ok(geminiCliIds.includes("gemini-3-flash-preview"));
});

test("T28: antigravity no longer exposes a static catalog fallback", () => {
  assert.equal(getStaticModelsForProvider("antigravity"), undefined);
});

test("T28: antigravity legacy GPT-OSS alias resolves to the current canonical ID", async () => {
  const legacy = await getModelInfoCore("antigravity/gpt-oss-120b-medium", {});
  assert.equal(legacy.provider, "antigravity");
  assert.equal(legacy.model, "gpt-oss-120b");
});

test("T28: antigravity passes agent IDs through to the upstream without tier downcast", async () => {
  // Agent IDs (gemini-3-flash-agent, gemini-pro-agent) used to be silently
  // remapped to a specific tier ("-low" / "-high"). That made the test/Health
  // UI hit a different tier than production traffic. The map was removed so
  // IDs now flow through to upstream as-is — see fix/antigravity-strip-alias-downcasts.
  const flash = await getModelInfoCore("antigravity/gemini-3-flash-agent", {});
  assert.equal(flash.provider, "antigravity");
  assert.equal(flash.model, "gemini-3-flash-agent");

  const pro = await getModelInfoCore("antigravity/gemini-pro-agent", {});
  assert.equal(pro.provider, "antigravity");
  assert.equal(pro.model, "gemini-pro-agent");
});

test("T28: antigravity bare/high IDs reach upstream unchanged (no -low downcast)", async () => {
  const flash = await getModelInfoCore("antigravity/gemini-3.5-flash", {});
  assert.equal(flash.provider, "antigravity");
  assert.equal(flash.model, "gemini-3.5-flash");

  const pro = await getModelInfoCore("antigravity/gemini-3.1-pro-high", {});
  assert.equal(pro.provider, "antigravity");
  assert.equal(pro.model, "gemini-3.1-pro-high");
});

test("T28: github registry exposes Gemini 3.1 Pro Preview and keeps legacy alias compatibility", async () => {
  const githubIds = REGISTRY.github.models.map((m) => m.id);

  assert.ok(githubIds.includes("gemini-3.1-pro-preview"));

  const canonical = await getModelInfoCore("gh/gemini-3.1-pro-preview", {});
  assert.equal(canonical.provider, "github");
  assert.equal(canonical.model, "gemini-3.1-pro-preview");

  const legacy = await getModelInfoCore("gh/gemini-3-pro", {});
  assert.equal(legacy.provider, "github");
  assert.equal(legacy.model, "gemini-3.1-pro-preview");
});

test("T28: vertex catalog includes partner models when vertex executor is available", () => {
  const vertexIds = REGISTRY.vertex.models.map((m) => m.id);

  assert.ok(vertexIds.includes("deepseek-v3.2"));
  assert.ok(vertexIds.includes("qwen3-next-80b"));
  assert.ok(vertexIds.includes("glm-5"));
});

test("T28: new catalog models resolve through getModelInfoCore", async () => {
  const minimax = await getModelInfoCore("minimax/minimax-m2.7", {});
  assert.equal(minimax.provider, "minimax");
  assert.equal(minimax.model, "minimax-m2.7");

  const flashLite = await getModelInfoCore("gemini/gemini-3.1-flash-lite-preview", {});
  assert.equal(flashLite.provider, "gemini");
  assert.equal(flashLite.model, "gemini-3.1-flash-lite-preview");

  const flashPreview = await getModelInfoCore("gemini/gemini-3-flash-preview", {});
  assert.equal(flashPreview.provider, "gemini");
  assert.equal(flashPreview.model, "gemini-3-flash-preview");

  const vertexPartner = await getModelInfoCore("vertex/qwen3-next-80b", {});
  assert.equal(vertexPartner.provider, "vertex");
  assert.equal(vertexPartner.model, "qwen3-next-80b");
});
