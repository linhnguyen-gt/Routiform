import test from "node:test";
import assert from "node:assert/strict";

test("MCP registry includes free tiers + compression info tools", async () => {
  const { MCP_TOOLS, MCP_TOOL_MAP } = await import("../../open-sse/mcp-server/schemas/tools.ts");
  const names = MCP_TOOLS.map((t) => t.name);
  assert.ok(names.includes("routiform_list_free_tiers"));
  assert.ok(names.includes("routiform_get_compression_info"));
  assert.equal(MCP_TOOL_MAP.routiform_list_free_tiers.phase, 1);
  assert.equal(MCP_TOOL_MAP.routiform_get_compression_info.phase, 1);
});

test("listFreeTiersInput accepts optional kind", async () => {
  const { listFreeTiersInput } = await import("../../open-sse/mcp-server/schemas/tools.ts");
  assert.deepEqual(listFreeTiersInput.parse({}), {});
  assert.deepEqual(listFreeTiersInput.parse({ kind: "forever" }), { kind: "forever" });
});

test("setup codex dry-run returns block without writing", async () => {
  const { setupHandler } = await import("../../bin/cli/setup.mjs");
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(" "));
  try {
    await setupHandler("codex", ["--dry-run", "--json"], {
      json: true,
      dryRun: true,
      port: 20128,
      apiKey: "test-key",
    });
  } finally {
    console.log = orig;
  }
  const joined = logs.join("\n");
  assert.ok(joined.includes("model_providers.routiform") || joined.includes("wouldWrite"));
});
