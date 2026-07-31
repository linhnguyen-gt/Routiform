/**
 * Runs the compression work that was staged during this request but must only land if the request
 * actually succeeded.
 *
 * `applyStackedCompression` runs once per RETRY ATTEMPT, not once per logical request — both the
 * credential-retry loop and the combo inner-retry loop re-enter it. An engine that persisted state
 * from `apply()` would therefore record facts about attempts that never reached a provider, and a
 * later attempt would compress against content no upstream ever received. Draining here, at the
 * points where the response has been validated, is what keeps "what the store believes was sent"
 * and "what was actually sent" the same set.
 *
 * Called from both success points — streaming and non-streaming. Missing either one would silently
 * halve the hit rate rather than fail, which is exactly the kind of bug that survives a release.
 */

interface DeferredWriteLike {
  engineId: string;
  commit: () => Promise<void> | void;
}

interface PipelineLike {
  compressionDeferredWrites?: DeferredWriteLike[];
  log?: { warn?: (tag: string, message: string) => void } | null;
}

export async function commitCompressionWrites(p: PipelineLike): Promise<void> {
  const writes = p.compressionDeferredWrites;
  if (!writes || writes.length === 0) return;

  // Cleared before running so a retry that somehow re-enters cannot double-commit.
  p.compressionDeferredWrites = [];

  for (const write of writes) {
    try {
      await write.commit();
    } catch (err) {
      // A failed commit costs a future compression saving and nothing else. Taking the response
      // down over it would trade a real delivered answer for a cache entry.
      const message = err instanceof Error ? err.message : String(err);
      p.log?.warn?.("Compression", `deferred write failed for ${write.engineId}: ${message}`);
    }
  }
}
