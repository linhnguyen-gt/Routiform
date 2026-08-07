import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-resolve-provider-ref-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const { resolveProviderRef } = await import("../../src/shared/models/resolve-provider-ref.ts");

// ──────────────── Pure resolution order ────────────────

test("a custom node prefix resolves as a node", () => {
  const resolved = resolveProviderRef("mynode", new Set(["mynode"]));
  assert.strictEqual(resolved.kind, "node");
  assert.strictEqual(resolved.nodeId, "mynode");
});

test("a Map of prefix -> node id reports the node id", () => {
  const resolved = resolveProviderRef("mynode", new Map([["mynode", "node-123"]]));
  assert.strictEqual(resolved.kind, "node");
  assert.strictEqual(resolved.nodeId, "node-123");
});

test("a registry provider id resolves as a provider", () => {
  assert.strictEqual(resolveProviderRef("nvidia", new Set()).kind, "provider");
});

test("a registry provider alias resolves as a provider", () => {
  const resolved = resolveProviderRef("kr", new Set());
  assert.strictEqual(resolved.kind, "provider");
  assert.strictEqual(resolved.providerId, "kiro");
});

test("a vendor prefix resolves as unknown", () => {
  assert.strictEqual(resolveProviderRef("meta", new Set()).kind, "unknown");
});

test("empty and non-string refs resolve as unknown", () => {
  assert.strictEqual(resolveProviderRef("", new Set()).kind, "unknown");
  assert.strictEqual(resolveProviderRef(undefined, new Set()).kind, "unknown");
});

// Order matters: getModelInfo (src/sse/services/model.ts:48-68) returns from the
// node branch before it ever reaches the registry.
test("nodes win over the registry when a prefix shadows a provider id", () => {
  const resolved = resolveProviderRef("nvidia", new Set(["nvidia"]));
  assert.strictEqual(resolved.kind, "node");
});

// ──────────────── Chat-route regression (M9 confused deputy) ────────────────

const core = await import("../../src/lib/db/core.ts");
const providersDb = await import("../../src/lib/db/providers.ts");
const providerChatRoute =
  await import("../../src/app/api/v1/providers/[provider]/chat/completions/route.ts");

const BELONG_ERROR = "does not belong to provider";

function postModel(provider, model) {
  const request = new Request(`http://localhost/api/v1/providers/${provider}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }] }),
  });
  return providerChatRoute.POST(request, { params: Promise.resolve({ provider }) });
}

async function isBelongRejection(response) {
  if (response.status !== 400) return false;
  const text = await response.text();
  return text.includes(BELONG_ERROR);
}

test("a custom node prefix is still rejected, never auto-prefixed to this provider", async () => {
  await providersDb.createProviderNode({
    type: "openai-compatible",
    name: "My Node",
    prefix: "mynode",
    apiType: "openai",
    baseUrl: "http://127.0.0.1:9/v1",
  });

  const response = await postModel("openai", "mynode/gpt-4o");
  assert.strictEqual(
    await isBelongRejection(response),
    true,
    "mynode/gpt-4o must 400, not be rewritten to openai/mynode/gpt-4o"
  );
});

test("another registry provider's prefix is still rejected", async () => {
  const response = await postModel("openai", "nvidia/meta/llama-3.3-70b-instruct");
  assert.strictEqual(await isBelongRejection(response), true);
});

test("a bare vendor prefix is auto-prefixed instead of rejected", async () => {
  const response = await postModel("nvidia", "meta/llama-3.3-70b-instruct");
  assert.strictEqual(
    await isBelongRejection(response),
    false,
    "meta/… is a vendor prefix on the model id, not a provider reference"
  );
});

test("a correctly-prefixed model and a bare model id are both accepted", async () => {
  assert.strictEqual(await isBelongRejection(await postModel("openai", "openai/gpt-4o")), false);
  assert.strictEqual(await isBelongRejection(await postModel("openai", "gpt-4o")), false);
});

// FAIL CLOSED: when the provider-node read fails we cannot tell a vendor prefix
// from a custom node prefix, so the request must keep its 400 rather than be
// dispatched to this provider with this provider's credentials.
test("a failing provider-node read keeps the 400 instead of auto-prefixing", async () => {
  const db = core.getDbInstance();
  db.prepare("DROP TABLE provider_nodes").run();

  try {
    const response = await postModel("nvidia", "meta/llama-3.3-70b-instruct");
    assert.strictEqual(await isBelongRejection(response), true);
  } finally {
    core.resetDbInstance();
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }
});
