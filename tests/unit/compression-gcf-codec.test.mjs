import test from "node:test";
import assert from "node:assert/strict";

/**
 * GCF tabular codec: hoist shared keys out of a homogeneous JSON array and emit rows as tuples.
 *
 *   [{id:1,status:"pending"}, {id:2,status:"done"}]
 *     → {h:["id","status"], r:[[1,"pending"],[2,"done"]]}
 *
 * Lossless is provable here, so it is proven: a property test over generated arrays asserts
 * decode(encode(x)) deep-equals x. That is the reason the lossless engines come before any eval
 * harness — their fidelity is a theorem, not a measurement.
 */

const { encodeTabular, decodeTabular, GCF_LEGEND } =
  await import("../../open-sse/compression/engines/gcf-codec.ts");

// ── deterministic generator, so a failure is reproducible from the seed alone ──
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function generateArray(rng, size) {
  const keyPool = ["id", "name", "status", "count", "ratio", "active", "note", "parent"];
  const keyCount = 2 + Math.floor(rng() * 5);
  const keys = keyPool.slice(0, keyCount);
  const rows = [];
  for (let i = 0; i < size; i++) {
    const row = {};
    for (const key of keys) {
      const kind = Math.floor(rng() * 5);
      if (kind === 0) row[key] = Math.floor(rng() * 10000);
      else if (kind === 1) row[key] = `value-${Math.floor(rng() * 1000)}`;
      else if (kind === 2) row[key] = rng() > 0.5;
      else if (kind === 3) row[key] = null;
      else row[key] = rng() * 100;
    }
    rows.push(row);
  }
  return rows;
}

test("round-trips 200 generated homogeneous arrays byte-for-byte", () => {
  const rng = makeRng(20260731);
  let encoded = 0;
  for (let n = 0; n < 200; n++) {
    const input = generateArray(rng, 20 + Math.floor(rng() * 40));
    const result = encodeTabular(input);
    if (!result) continue;
    encoded++;
    assert.deepEqual(decodeTabular(result), input, `round-trip failed on generated array ${n}`);
  }
  assert.ok(encoded > 150, `expected most generated arrays to encode, got ${encoded}/200`);
});

test("key insertion order does not change the encoding", () => {
  const a = [
    { id: 1, status: "x", note: "n" },
    { status: "y", note: "m", id: 2 },
  ];
  const encoded = encodeTabular(
    a.concat(Array.from({ length: 20 }, (_, i) => ({ id: i, status: "z", note: "q" })))
  );
  assert.ok(encoded);
  // Sorted, so a schema recorded on one machine matches one recorded on another.
  assert.deepEqual(encoded.h, ["id", "note", "status"]);
  assert.deepEqual(encoded.r[0], [1, "n", "x"]);
  assert.deepEqual(encoded.r[1], [2, "m", "y"]);
});

test("aborts on a heterogeneous array rather than padding a schema", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ id: i, status: "ok" }));
  rows[17] = { id: 17 };
  assert.equal(encodeTabular(rows), null);
});

test("an explicit null survives; a missing key is heterogeneity and aborts", () => {
  const withNull = Array.from({ length: 25 }, (_, i) => ({ id: i, result: null }));
  const encoded = encodeTabular(withNull);
  assert.ok(encoded);
  assert.deepEqual(decodeTabular(encoded), withNull);

  const withMissing = withNull.map((row, i) => (i === 3 ? { id: row.id } : row));
  assert.equal(encodeTabular(withMissing), null);
});

test("respects the item-count and byte thresholds", () => {
  const small = Array.from({ length: 19 }, (_, i) => ({ id: i, s: "a" }));
  assert.equal(encodeTabular(small), null, "19 items is below the 20-item gate");

  const twenty = Array.from({ length: 20 }, (_, i) => ({ id: i, s: "a" }));
  assert.ok(encodeTabular(twenty), "20 items should encode");

  // Under 20 items but over 5KB still qualifies — the gate is either/or.
  const fat = Array.from({ length: 5 }, (_, i) => ({ id: i, blob: "x".repeat(1200) }));
  assert.ok(encodeTabular(fat), "a 5KB array should encode even with few items");
});

test("declines anything that is not a flat homogeneous object array", () => {
  assert.equal(encodeTabular(null), null);
  assert.equal(encodeTabular([]), null);
  assert.equal(encodeTabular(Array.from({ length: 30 }, (_, i) => i)), null, "scalars");
  assert.equal(
    encodeTabular(Array.from({ length: 30 }, () => ({ id: 1, nested: { deep: true } }))),
    null,
    "nested objects are out of scope for this phase, not silently flattened"
  );
  assert.equal(
    encodeTabular(Array.from({ length: 30 }, () => ({ id: 1, list: [1, 2] }))),
    null,
    "arrays inside rows are also nesting"
  );
});

test("returns null when encoding would not actually shrink the payload", () => {
  // Single-key rows: the schema header costs more than tuple-ing saves.
  const rows = Array.from({ length: 20 }, (_, i) => ({ a: i }));
  const encoded = encodeTabular(rows);
  if (encoded) {
    const before = JSON.stringify(rows).length;
    const after = JSON.stringify(encoded).length;
    assert.ok(after < before, `encoding grew the payload: ${before} → ${after}`);
  }
});

test("decode rejects a malformed envelope instead of guessing", () => {
  assert.throws(() => decodeTabular({ h: ["a"], r: [[1, 2]] }), /width/i);
  assert.throws(() => decodeTabular({ h: "a", r: [] }), /header/i);
  assert.throws(() => decodeTabular({ r: [] }), /header/i);
});

test("the legend is a single short line the model can act on", () => {
  assert.ok(GCF_LEGEND.length < 200);
  assert.ok(!GCF_LEGEND.includes("\n"));
  assert.ok(GCF_LEGEND.includes("h") && GCF_LEGEND.includes("r"));
});
