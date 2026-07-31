/**
 * Tabular codec for homogeneous JSON arrays.
 *
 * Tool results are full of them — query results, file listings, test reports — and every row
 * repeats the same key names. Hoisting the keys once and emitting rows as tuples removes that
 * repetition without discarding anything:
 *
 *   [{id:1,status:"pending"}, {id:2,status:"done"}]
 *     → {h:["id","status"], r:[[1,"pending"],[2,"done"]]}
 *
 * Lossless is a theorem here rather than a measurement, which is why `decode` ships alongside and
 * a property test drives the implementation. `decode` exists for logging and eval replay; the
 * model receives the encoded form plus a one-line legend.
 *
 * Scope is deliberately flat arrays of scalars. Nested objects abort the encode rather than being
 * flattened — a flattening scheme needs its own round-trip proof, and smuggling one in here would
 * mean shipping an unproven transform under a proof that covers something else.
 */

export interface TabularEnvelope {
  /** Column names, sorted. */
  h: string[];
  /** Rows, positionally aligned to `h`. */
  r: unknown[][];
}

/** Below either of these the header costs more than the tuples save. */
const MIN_ITEMS = 20;
const MIN_BYTES = 5 * 1024;

export const GCF_LEGEND =
  "Tabular encoding: {h:[column names], r:[rows]} — row[i] corresponds to h[i], nulls explicit.";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Scalars only. A nested object or array means this array is out of scope, not that it needs flattening. */
function isScalar(value: unknown): boolean {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

/**
 * Encode, or return null when the input does not qualify.
 *
 * Null covers every decline for the same reason: below threshold, heterogeneous, nested, or simply
 * not smaller afterwards. The caller treats all of them identically — leave the payload alone.
 */
export function encodeTabular(input: unknown): TabularEnvelope | null {
  if (!Array.isArray(input) || input.length === 0) return null;

  const serialized = JSON.stringify(input);
  if (input.length < MIN_ITEMS && serialized.length < MIN_BYTES) return null;

  const first = input[0];
  if (!isPlainObject(first)) return null;

  // Sorted, so two machines that saw the same rows in different insertion orders produce the same
  // schema. Unsorted keys were research's failure mode 2: tuples silently misalign.
  const header = Object.keys(first).sort();
  if (header.length === 0) return null;

  const rows: unknown[][] = [];
  for (const raw of input) {
    if (!isPlainObject(raw)) return null;

    const keys = Object.keys(raw);
    // Every row must carry exactly the same key set. A row missing a key is heterogeneity, and
    // padding it with null would silently invent data the source never had.
    if (keys.length !== header.length) return null;

    const row: unknown[] = [];
    for (const key of header) {
      if (!Object.prototype.hasOwnProperty.call(raw, key)) return null;
      const value = raw[key];
      if (!isScalar(value)) return null;
      row.push(value);
    }
    rows.push(row);
  }

  const envelope: TabularEnvelope = { h: header, r: rows };
  // An encoding that grows the payload is not an optimisation, whatever else it is.
  if (JSON.stringify(envelope).length >= serialized.length) return null;

  return envelope;
}

/**
 * Decode an envelope back to the original array.
 *
 * Throws on a malformed envelope rather than guessing: a decoder that repairs its input cannot be
 * used to prove the encoder is lossless, because it hides exactly the corruption the proof is for.
 */
export function decodeTabular(envelope: unknown): Record<string, unknown>[] {
  if (!isPlainObject(envelope) || !Array.isArray(envelope.h) || !Array.isArray(envelope.r)) {
    throw new Error("[gcf] malformed envelope: expected a header array `h` and rows `r`");
  }

  const header = envelope.h as unknown[];
  if (!header.every((key) => typeof key === "string")) {
    throw new Error("[gcf] malformed envelope: header must be an array of strings");
  }

  return (envelope.r as unknown[][]).map((row, index) => {
    if (!Array.isArray(row) || row.length !== header.length) {
      throw new Error(
        `[gcf] row ${index} width ${Array.isArray(row) ? row.length : "?"} does not match header width ${header.length}`
      );
    }
    const out: Record<string, unknown> = {};
    header.forEach((key, i) => {
      out[key as string] = row[i];
    });
    return out;
  });
}
