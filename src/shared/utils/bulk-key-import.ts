/**
 * Bulk provider-key import — parsing, naming, and orchestration.
 *
 * This module never writes. The insert stays on `POST /api/providers`, which owns validation,
 * encryption, and the audit event; the caller injects that call as `createConnection`. Nothing here
 * touches `POST /api/keys`, which mints Routiform's own gateway credentials from a name and imports
 * no value at all — pasting provider keys there would mint gateway keys, not import provider ones.
 */

/** Above this, the paste is rejected outright rather than fired as N sequential writes. */
export const BULK_KEY_IMPORT_MAX = 50;

const KEY_NAME_PATTERN = /^Key (\d+)$/;

export interface ParsedBulkKeys {
  /** Trimmed, non-empty, de-duplicated, in paste order. */
  values: string[];
  /** Segments discarded as empty or as an in-paste duplicate. */
  dropped: number;
}

/**
 * Splits a paste into candidate key values.
 *
 * Newline is the primary separator and `|` a convenience. No assumption is made about key format —
 * providers differ, and a value that survives trimming is passed through as-is.
 */
export function parseBulkKeys(text: string): ParsedBulkKeys {
  const segments = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/[\n|]/);

  const values: string[] = [];
  const seen = new Set<string>();
  for (const segment of segments) {
    const value = segment.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }

  return { values, dropped: segments.length - values.length };
}

export interface NamedBulkKey {
  value: string;
  name: string;
}

/**
 * Assigns `Key N` names starting one above the highest existing `Key N`.
 *
 * `max+1` rather than gap-fill: the requirement is that no existing connection is overwritten, and
 * the create path upserts on `(provider, apikey, name)` — so a reused name silently replaces a
 * stored credential. Names that are not `Key N` do not move the counter but are still never
 * collided with.
 */
export function nextKeyNames(values: string[], existingNames: Iterable<string>): NamedBulkKey[] {
  const taken = new Set<string>();
  let highest = 0;

  for (const existing of existingNames ?? []) {
    if (typeof existing !== "string") continue;
    taken.add(existing);
    const match = KEY_NAME_PATTERN.exec(existing);
    if (match) highest = Math.max(highest, Number.parseInt(match[1], 10));
  }

  let counter = highest;
  return values.map((value) => {
    let name = `Key ${++counter}`;
    while (taken.has(name)) name = `Key ${++counter}`;
    taken.add(name);
    return { value, name };
  });
}

export type BulkImportStatus = "added" | "skipped" | "failed";

export interface BulkKeyCreateOutcome {
  status: BulkImportStatus;
  reason?: string;
}

export interface BulkImportItemResult extends BulkKeyCreateOutcome {
  name: string;
}

export interface BulkImportOutcome {
  results: BulkImportItemResult[];
  added: number;
  skippedDuplicate: number;
  failed: number;
}

/**
 * Runs one create per item, sequentially, and reports each outcome.
 *
 * Sequential because the writes share a name space that the create path resolves by upsert; and
 * because a partial batch has to stay legible — a failure at item 4 leaves items 1-3 imported and
 * says so, rather than failing the import as a whole.
 */
export async function runBulkKeyImport(
  items: NamedBulkKey[],
  createConnection: (item: NamedBulkKey) => Promise<BulkKeyCreateOutcome>,
  onProgress?: (done: number, total: number) => void
): Promise<BulkImportOutcome> {
  const results: BulkImportItemResult[] = [];

  for (const item of items) {
    let outcome: BulkKeyCreateOutcome;
    try {
      outcome = await createConnection(item);
    } catch (error) {
      outcome = {
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    results.push({ name: item.name, ...outcome });
    onProgress?.(results.length, items.length);
  }

  return {
    results,
    added: results.filter((r) => r.status === "added").length,
    skippedDuplicate: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
  };
}
