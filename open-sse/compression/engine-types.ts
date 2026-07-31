import type { RtkProfile } from "../rtk/types.ts";

/**
 * Lossless engines round-trip byte-identically; lossy ones discard information the model
 * is expected not to need. Stage is the PRIMARY sort key in the registry — a lossy engine
 * cannot order itself ahead of a lossless one, whatever `order` it declares.
 */
export type EngineStage = "lossless" | "lossy";

export const ENGINE_STAGES: readonly EngineStage[] = ["lossless", "lossy"];

/**
 * The request shapes the compression engines can walk. Derived from the branches
 * `compressMessages` already discriminates on (rtk/index.ts:40-111) rather than invented:
 * an engine that cannot walk a shape must decline it in `supports()` instead of silently
 * no-oping, so the result records "declined" rather than "applied, saved nothing".
 */
export type BodyShape = "openai-chat" | "openai-responses" | "claude" | "kiro" | "unknown";

export interface EngineContext {
  provider: string;
  model: string;
  userAgent: string | null;
  rtkProfile: RtkProfile;
  bodyShape: BodyShape;
  /**
   * Stable identity for the conversation this request belongs to, or null when none can be
   * derived. Never fabricated — see research/spike-conversation-identity-source.md. A random
   * per-request value would look like an identity while guaranteeing every lookup misses.
   */
  conversationId: string | null;
  /**
   * Tenant dimension. Phase 02's dedup key requires this unconditionally: a key without it
   * lets one caller's content reach another's request.
   */
  apiKeyId: string | null;
  /**
   * Container indices that engines earlier in this run have already rewritten.
   *
   * The pipeline extends it as each engine reports, so an engine sees exactly what ran before it.
   * Compaction needs this: RTK's filters emit truncation markers that are not JSON, and a second
   * pass over them would either fail to parse or — the dangerous case — succeed on a fragment and
   * corrupt the filter's output. Ordering alone cannot prevent that; knowing what was touched can.
   */
  touchedSoFar: Set<number>;
  /** Post-success work staged by engines during this attempt. See DeferredWrite. */
  deferredWrites: DeferredWrite[];
}

/**
 * Work an engine wants done only if the request actually succeeds.
 *
 * `applyStackedCompression` runs once per RETRY ATTEMPT, not once per logical request. Any engine
 * that persists state has to account for that: a write issued during a doomed attempt is a write
 * about content no upstream ever received. Staging the work here and committing it after success
 * is the only ordering that makes those two facts compatible.
 */
export interface DeferredWrite {
  engineId: string;
  commit: () => Promise<void> | void;
}

export interface EngineResult {
  applied: boolean;
  stats: Record<string, number | string | boolean>;
  bytesBefore: number;
  bytesAfter: number;
  /** Set by the runner, never by the engine. */
  reverted: boolean;
  /**
   * Indices of the primary message container this engine mutated, enabling a revert that
   * restores only those entries and leaves earlier engines' savings on other entries intact.
   *
   * `null` means "scope unknown" and forces a whole-body revert. That is the honest answer
   * for engines that mutate through code they do not own (RTK, Caveman), and it is why the
   * runner must treat null as a real value rather than an empty list.
   */
  touchedIndices: number[] | null;
  /**
   * The engine's own stats object, verbatim, for consumers that predate the registry.
   *
   * `stats` above is a flat scalar map, which is the right shape for a header segment and the
   * wrong shape for `StackApplyResult.rtkStats` — that field is an `RtkStats` with a populated
   * `hits` array that `formatRtkLog` walks. Rebuilding it from scalars produced a shape that
   * type-checked and threw at runtime. Passing the original object through is the only way the
   * legacy fields stay byte-identical rather than approximately identical.
   */
  native?: unknown;
}

export interface CompressionEngine {
  id: string;
  stage: EngineStage;
  /** Secondary sort key, within a stage. */
  order: number;
  /**
   * Whether this engine has cleared the fidelity gate and may therefore ship under a preset
   * other than `aggressive`. Applies to lossless engines too: "lossless" says the bytes are
   * recoverable, not that the model behaves the same way when they are gone.
   */
  gateCleared: boolean;
  supports(ctx: EngineContext): boolean;
  apply(body: Record<string, unknown>, ctx: EngineContext): Omit<EngineResult, "reverted">;
}

/** An engine result for a run that never happened. */
export function declinedResult(): EngineResult {
  return {
    applied: false,
    stats: {},
    bytesBefore: 0,
    bytesAfter: 0,
    reverted: false,
    touchedIndices: [],
  };
}

/**
 * The array an engine's `touchedIndices` refer to. Kiro has no flat message array, which is
 * exactly why engines report `null` for it.
 */
export function resolveContainer(
  body: Record<string, unknown>
): { key: "messages" | "input"; items: Record<string, unknown>[] } | null {
  if (Array.isArray(body.messages)) {
    return { key: "messages", items: body.messages as Record<string, unknown>[] };
  }
  if (Array.isArray(body.input)) {
    return { key: "input", items: body.input as Record<string, unknown>[] };
  }
  return null;
}

export function detectBodyShape(body: Record<string, unknown>): BodyShape {
  if (body.conversationState) return "kiro";
  if (Array.isArray(body.input)) return "openai-responses";
  if (Array.isArray(body.messages)) {
    // Claude carries tool output as `tool_result` blocks inside a content array; OpenAI uses
    // a `role: "tool"` message. Both can appear in a `messages` array, so the discriminator
    // is the block type, not the container.
    for (const raw of body.messages as unknown[]) {
      const msg = raw as Record<string, unknown> | null;
      if (!msg || !Array.isArray(msg.content)) continue;
      for (const rawBlock of msg.content as unknown[]) {
        const block = rawBlock as Record<string, unknown> | null;
        if (block && block.type === "tool_result") return "claude";
      }
    }
    return "openai-chat";
  }
  return "unknown";
}
