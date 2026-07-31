import test from "node:test";
import assert from "node:assert/strict";

// RegistryEntry.executor is set on every registry entry but never read — dispatch goes through the
// provider-id-keyed map in executors/index.ts. That made the field decorative and let it drift:
// values like "openai" and "opencode" name no executor at all. A provider added with
// `executor: "codex"` would silently get DefaultExecutor.
//
// The field is not yet authoritative (that decision belongs with the provider manifest work), but
// it must at least be truthful, so a later switch to registry-driven dispatch cannot change
// behaviour silently.

const { getExecutorKeys, DEFAULT_EXECUTOR_SENTINEL } =
  await import("../../open-sse/executors/index.ts");
const { REGISTRY: REGISTRY_PROVIDERS } =
  await import("../../open-sse/config/registry-providers.ts");

test("every registry executor value names a real executor or the default sentinel", () => {
  const validKeys = new Set([...getExecutorKeys(), DEFAULT_EXECUTOR_SENTINEL]);
  const offenders = [];

  for (const [id, entry] of Object.entries(REGISTRY_PROVIDERS)) {
    const value = entry?.executor;
    if (typeof value !== "string" || !validKeys.has(value)) {
      offenders.push(`${id} -> ${JSON.stringify(value)}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `registry entries name executors that do not exist:\n  ${offenders.join("\n  ")}`
  );
});

test("a specialised provider names its own executor, not a family name", () => {
  // opencode-zen and opencode-go each have a dedicated executor instance; naming them "opencode"
  // pointed at nothing and would resolve to the default under registry-driven dispatch.
  assert.equal(REGISTRY_PROVIDERS["opencode-zen"]?.executor, "opencode-zen");
  assert.equal(REGISTRY_PROVIDERS["opencode-go"]?.executor, "opencode-go");
});

test("OpenAI-compatible providers declare the default sentinel", () => {
  // DefaultExecutor is the OpenAI-compatible path; "openai" and "openrouter" were never keys.
  assert.equal(REGISTRY_PROVIDERS["cline"]?.executor, DEFAULT_EXECUTOR_SENTINEL);
  assert.equal(REGISTRY_PROVIDERS["kilocode"]?.executor, DEFAULT_EXECUTOR_SENTINEL);
});
