import { measureBodyBytes, snapshotBody } from "./inflation-guard.ts";
import { declinedResult, resolveContainer } from "./engine-types.ts";
import type { CompressionEngine, EngineContext, EngineResult } from "./engine-types.ts";

export interface RunEngineOptions {
  /**
   * The body's state before this engine ran. The caller owns it: the pipeline already takes
   * exactly one whole-body snapshot for the global backstop, so the first engine reuses that
   * and the runner never has to clone before applying — which is what keeps a no-op engine
   * free rather than costing a deep clone to discover it did nothing.
   */
  previous: Record<string, unknown>;
  /** Body size before this engine, carried from the prior engine to avoid re-serializing. */
  bytesBefore?: number;
  /**
   * Whether a later engine may still need to revert to this engine's output. False for the last
   * engine in the run, where advancing the revert point would deep-clone the payload to produce
   * a value nothing ever reads.
   */
  advancePrevious?: boolean;
}

export interface RunEngineOutcome {
  skipped: boolean;
  result: EngineResult;
  /** The body's state after this engine, for the next engine to revert to. */
  previous: Record<string, unknown>;
  bytesAfter: number;
}

function cloneEntry(entry: unknown): unknown {
  return entry == null ? entry : JSON.parse(JSON.stringify(entry));
}

/**
 * Copy the given container indices from `from` into `to`. Used in both directions: to undo an
 * engine (restore body from the previous state) and to advance the previous state past an
 * engine that succeeded.
 */
function copyIndices(
  to: Record<string, unknown>,
  from: Record<string, unknown>,
  indices: number[]
): boolean {
  const target = resolveContainer(to);
  const source = resolveContainer(from);
  if (!target || !source || target.key !== source.key) return false;
  for (const i of indices) {
    if (i < 0 || i >= source.items.length || i >= target.items.length) return false;
    target.items[i] = cloneEntry(source.items[i]) as Record<string, unknown>;
  }
  return true;
}

function restoreWholeBody(body: Record<string, unknown>, previous: Record<string, unknown>): void {
  for (const key of Object.keys(body)) delete body[key];
  Object.assign(body, snapshotBody(previous));
}

/**
 * Run one engine under its own inflation guard.
 *
 * Per-engine rather than global: the existing guard reverts EVERY engine's work when the total
 * grows (pipeline.ts:95), so one engine that inflates by a byte discards every other engine's
 * savings. Here an engine that inflates reverts only itself.
 *
 * The revert is index-scoped where the engine can say what it touched, and whole-body where it
 * cannot. That distinction is the whole cost story: scoped restores copy a handful of message
 * entries, whole-body restores deep-clone the payload. Engines that mutate through code they do
 * not own report `null` and pay the full price; engines written here report indices and do not.
 */
export function runEngine(
  engine: CompressionEngine,
  body: Record<string, unknown>,
  ctx: EngineContext,
  options: RunEngineOptions
): RunEngineOutcome {
  const { previous } = options;

  if (!engine.supports(ctx)) {
    return {
      skipped: true,
      result: declinedResult(),
      previous,
      bytesAfter: options.bytesBefore ?? measureBodyBytes(body),
    };
  }

  const bytesBefore = options.bytesBefore ?? measureBodyBytes(body);
  const raw = engine.apply(body, ctx);

  if (!raw.applied) {
    // Nothing changed, so the previous state is still current and nothing needs measuring.
    return {
      skipped: false,
      result: { ...raw, reverted: false },
      previous,
      bytesAfter: bytesBefore,
    };
  }

  const bytesAfter = measureBodyBytes(body);

  if (bytesAfter > bytesBefore) {
    const scoped =
      Array.isArray(raw.touchedIndices) && copyIndices(body, previous, raw.touchedIndices);
    if (!scoped) restoreWholeBody(body, previous);
    return {
      skipped: false,
      result: { ...raw, reverted: true, bytesAfter: bytesBefore },
      previous,
      bytesAfter: bytesBefore,
    };
  }

  // Advance the previous state so the NEXT engine reverts to this point, not to the start.
  if (options.advancePrevious === false) {
    return { skipped: false, result: { ...raw, reverted: false }, previous, bytesAfter };
  }

  let advanced = previous;
  if (Array.isArray(raw.touchedIndices)) {
    if (!copyIndices(previous, body, raw.touchedIndices)) {
      advanced = snapshotBody(body);
    }
  } else {
    advanced = snapshotBody(body);
  }

  return {
    skipped: false,
    result: { ...raw, reverted: false },
    previous: advanced,
    bytesAfter,
  };
}
