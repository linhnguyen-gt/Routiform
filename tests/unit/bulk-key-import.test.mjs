import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Bulk import pastes several provider keys at once. The correctness lives in two pure functions —
 * parsing and naming — plus the orchestration that reports what happened per item.
 *
 * The naming matters more than it looks: `createProviderConnection` upserts on
 * `(provider, apikey, name)`, so a reused name replaces a stored credential instead of adding one.
 */

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const { BULK_KEY_IMPORT_MAX, parseBulkKeys, nextKeyNames, runBulkKeyImport } =
  await import("../../src/shared/utils/bulk-key-import.ts");

// ── parseBulkKeys ────────────────────────────────────────────────────────────

test("pipe-separated", () => {
  assert.deepEqual(parseBulkKeys("a|b|c").values, ["a", "b", "c"]);
});

test("newline-separated", () => {
  assert.deepEqual(parseBulkKeys("a\nb\nc").values, ["a", "b", "c"]);
});

test("mixed separators, including CRLF", () => {
  assert.deepEqual(parseBulkKeys("a|b\r\nc\nd|e").values, ["a", "b", "c", "d", "e"]);
});

test("leading and trailing whitespace is trimmed off each value", () => {
  assert.deepEqual(parseBulkKeys("  a  \n\t b\t \n c ").values, ["a", "b", "c"]);
});

test("empty segments are dropped and counted", () => {
  const parsed = parseBulkKeys("a\n\n\nb||c\n");
  assert.deepEqual(parsed.values, ["a", "b", "c"]);
  assert.equal(parsed.dropped, 4);
});

test("a single value with no separator", () => {
  assert.deepEqual(parseBulkKeys("sk-only-one").values, ["sk-only-one"]);
});

test("duplicates within the paste collapse to the first occurrence", () => {
  const parsed = parseBulkKeys("a\nb\na\nb\nc");
  assert.deepEqual(parsed.values, ["a", "b", "c"]);
  assert.equal(parsed.dropped, 2);
});

test("empty input yields nothing, and does not throw", () => {
  assert.deepEqual(parseBulkKeys("").values, []);
  assert.deepEqual(parseBulkKeys("   \n \n ").values, []);
  assert.deepEqual(parseBulkKeys(null).values, []);
  assert.deepEqual(parseBulkKeys(undefined).values, []);
});

test("no assumption is made about key format — exotic values pass through intact", () => {
  const values = ['{"type":"service_account","private_key":"..."}', "pt-abc.def", "AKIA/1+2=="];
  assert.deepEqual(parseBulkKeys(values.join("\n")).values, values);
});

// ── nextKeyNames ─────────────────────────────────────────────────────────────

test("allocation starts one above the highest existing Key N", () => {
  const named = nextKeyNames(["a", "b", "c"], ["Key 1", "Key 3"]);
  assert.deepEqual(
    named.map((n) => n.name),
    ["Key 4", "Key 5", "Key 6"]
  );
});

test("values are paired with their names in paste order", () => {
  assert.deepEqual(nextKeyNames(["first", "second"], []), [
    { value: "first", name: "Key 1" },
    { value: "second", name: "Key 2" },
  ]);
});

test("names that are not `Key N` do not move the counter", () => {
  const named = nextKeyNames(["a"], ["production", "backup-2024", "Key99"]);
  assert.equal(named[0].name, "Key 1");
});

test("but a non-`Key N` name is still never collided with", () => {
  // "Key 1" would overwrite the stored connection, since the create path upserts on the name.
  const named = nextKeyNames(["a", "b"], ["Key 3", "Key 1", "Key 2"]);
  assert.deepEqual(
    named.map((n) => n.name),
    ["Key 4", "Key 5"]
  );
});

test("a two-digit existing key allocates from 11, not from 2", () => {
  assert.equal(nextKeyNames(["a"], ["Key 10"])[0].name, "Key 11");
});

test("no existing names at all starts at Key 1", () => {
  assert.equal(nextKeyNames(["a"], [])[0].name, "Key 1");
});

test("non-string entries in the existing list are ignored, not crashed on", () => {
  assert.equal(nextKeyNames(["a"], [null, undefined, 7, "Key 2"])[0].name, "Key 3");
});

test("nothing to import produces no names", () => {
  assert.deepEqual(nextKeyNames([], ["Key 1"]), []);
});

// ── runBulkKeyImport ─────────────────────────────────────────────────────────

/** A store with the same upsert-on-name semantics as `createProviderConnection`. */
function makeStore(initial) {
  const connections = initial.map((c) => ({ ...c }));
  return {
    connections,
    snapshot: () => connections.map((c) => ({ ...c })),
    create({ name, value }) {
      if (connections.some((c) => c.value === value)) {
        return { status: "skipped", reason: "already stored" };
      }
      const existing = connections.find((c) => c.name === name);
      if (existing) {
        // The behaviour the naming exists to avoid — surfaced loudly if it ever happens.
        throw new Error(`would overwrite ${name}`);
      }
      connections.push({ name, value });
      return { status: "added" };
    },
  };
}

test("a mixed batch reports added, skipped, and failed per item", async () => {
  const store = makeStore([
    { name: "Key 1", value: "old-one" },
    { name: "Key 3", value: "already-here" },
  ]);
  const before = store.snapshot();

  const items = nextKeyNames(["fresh-a", "already-here", "fresh-b", "bad-key"], ["Key 1", "Key 3"]);

  const outcome = await runBulkKeyImport(items, async (item) => {
    if (item.value === "bad-key") return { status: "failed", reason: "Invalid provider" };
    return store.create(item);
  });

  assert.equal(outcome.added, 2);
  assert.equal(outcome.skippedDuplicate, 1);
  assert.equal(outcome.failed, 1);
  assert.deepEqual(
    outcome.results.map((r) => [r.name, r.status]),
    [
      ["Key 4", "added"],
      ["Key 5", "skipped"],
      ["Key 6", "added"],
      ["Key 7", "failed"],
    ]
  );

  // The surviving names are contiguous from max+1, and nothing that existed was touched.
  assert.deepEqual(
    store.connections.filter((c) => !before.some((b) => b.name === c.name)).map((c) => c.name),
    ["Key 4", "Key 6"]
  );
  for (const original of before) {
    assert.deepEqual(
      store.connections.find((c) => c.name === original.name),
      original,
      `${original.name} must be neither renamed nor overwritten`
    );
  }
  assert.equal(store.connections.length, before.length + 2);
});

test("a thrown create is reported as a failure, and the batch continues", async () => {
  const items = nextKeyNames(["a", "b", "c"], []);
  const outcome = await runBulkKeyImport(items, async (item) => {
    if (item.value === "b") throw new Error("network down");
    return { status: "added" };
  });
  assert.equal(outcome.added, 2);
  assert.equal(outcome.failed, 1);
  assert.equal(outcome.results[1].reason, "network down");
});

test("progress is reported once per item, in order", async () => {
  const seen = [];
  await runBulkKeyImport(
    nextKeyNames(["a", "b", "c"], []),
    async () => ({ status: "added" }),
    (done, total) => seen.push(`${done}/${total}`)
  );
  assert.deepEqual(seen, ["1/3", "2/3", "3/3"]);
});

test("an empty batch is a no-op, not an error", async () => {
  const outcome = await runBulkKeyImport([], async () => {
    throw new Error("must not be called");
  });
  assert.deepEqual(outcome, { results: [], added: 0, skippedDuplicate: 0, failed: 0 });
});

// ── The cap, and the route this feature must never touch ─────────────────────

test("the batch cap is explicit and the modal rejects above it with the count", () => {
  assert.equal(BULK_KEY_IMPORT_MAX, 50);
  const modal = readFileSync(
    new URL(
      "src/app/(dashboard)/dashboard/providers/components/ProviderDetailBulkImportKeysModal.tsx",
      `file://${REPO_ROOT}`
    ),
    "utf-8"
  );
  assert.match(
    modal,
    /\{parsed\.values\.length\} keys exceeds the limit of \{BULK_KEY_IMPORT_MAX\}/,
    "the rejection has to name the count the operator pasted"
  );
});

test("no gateway API key is created by this feature, ever", () => {
  // `POST /api/keys` mints Routiform's own gateway credentials from a name and imports no value.
  // A bulk provider-key import that reached it would mint N keys that satisfy `verifyAuth` for the
  // whole management API. The guard is that the feature's files never name it.
  const FEATURE_FILES = [
    "src/shared/utils/bulk-key-import.ts",
    "src/app/(dashboard)/dashboard/providers/components/ProviderDetailBulkImportKeysModal.tsx",
  ];
  for (const relative of FEATURE_FILES) {
    const source = readFileSync(new URL(relative, `file://${REPO_ROOT}`), "utf-8");
    assert.doesNotMatch(source, /createApiKey/, `${relative} must not mint gateway keys`);
    assert.doesNotMatch(
      source,
      /["'`]\/api\/keys/,
      `${relative} must not post to the gateway-key route`
    );
  }
});

test("the write goes to the existing single-key create route, not a new one", () => {
  const modal = readFileSync(
    new URL(
      "src/app/(dashboard)/dashboard/providers/components/ProviderDetailBulkImportKeysModal.tsx",
      `file://${REPO_ROOT}`
    ),
    "utf-8"
  );
  const posted = [...modal.matchAll(/fetch\(\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(posted, ["/api/providers"]);
});

test("the textarea is cleared once anything was imported", () => {
  const modal = readFileSync(
    new URL(
      "src/app/(dashboard)/dashboard/providers/components/ProviderDetailBulkImportKeysModal.tsx",
      `file://${REPO_ROOT}`
    ),
    "utf-8"
  );
  assert.match(modal, /if \(result\.added > 0\) setText\(""\)/);
});
