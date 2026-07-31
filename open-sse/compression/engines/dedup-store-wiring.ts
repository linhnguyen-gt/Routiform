import { setDedupStore } from "./session-dedup.ts";
import { SqliteDedupStore } from "./sqlite-dedup-store.ts";

/**
 * Point Session-Dedup at the durable store.
 *
 * Separate from the engine so the engine stays importable — and testable — without dragging in
 * the database. The engine defaults to the in-memory store, which is the correct default for a
 * unit test and the wrong one for a server, so a process that serves requests calls this once.
 *
 * The DB module is loaded here and the handle resolved per access, not captured: this runs before
 * the database is necessarily open, and a store holding a null handle from import time would
 * silently never dedup anything while reporting nothing wrong.
 */

let wired = false;
let dbModule: { getDbInstance?: () => unknown } | null = null;

export async function useDurableDedupStore(): Promise<void> {
  if (wired) return;
  wired = true;

  try {
    dbModule = (await import("@/lib/db/core")) as { getDbInstance?: () => unknown };
  } catch {
    // No database in this context (build, CLI, test) — the in-memory default stands.
    return;
  }

  setDedupStore(
    new SqliteDedupStore(() => {
      try {
        return (dbModule?.getDbInstance?.() as never) ?? null;
      } catch {
        return null;
      }
    })
  );
}
