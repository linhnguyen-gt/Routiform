import { cavemanCompressMessages } from "../caveman-en.ts";
import type { CavemanStats } from "../types.ts";
import type { CompressionEngine, EngineContext } from "../engine-types.ts";

/**
 * Caveman EN as a registry entry.
 *
 * Classified LOSSY, and that classification is a judgement with teeth: it strips English filler
 * from prose, so the bytes do not round-trip even though `preservation.ts` keeps code fences,
 * inline code and URLs byte-identical. Calling it lossless would let it ship under `safe`, which
 * is the preset whose whole promise is that nothing is discarded.
 *
 * `gateCleared: true` is grandfathering, not a measurement: this engine is what installs run
 * today, so it stays in `balanced` and upgrades keep their current behaviour. Engines added
 * after the Phase 03 harness exists must earn the flag rather than inherit it.
 *
 * Kiro bodies get nothing from this engine — `cavemanCompressMessages` walks `messages` or
 * `input` only. That is pre-existing behaviour, pinned by the characterization goldens, and
 * `supports()` states it rather than leaving the engine to no-op silently.
 */
export const cavemanEngine: CompressionEngine = {
  id: "caveman-en",
  stage: "lossy",
  order: 100,
  gateCleared: true,

  supports(ctx: EngineContext): boolean {
    return ctx.bodyShape !== "kiro" && ctx.bodyShape !== "unknown";
  },

  apply(body: Record<string, unknown>) {
    const stats: CavemanStats | null = cavemanCompressMessages(body);

    if (!stats || stats.messagesTouched === 0) {
      return {
        applied: false,
        stats: { messagesTouched: 0 },
        bytesBefore: stats?.bytesBefore ?? 0,
        bytesAfter: stats?.bytesAfter ?? 0,
        touchedIndices: [],
        native: stats,
      };
    }

    return {
      applied: true,
      stats: { messagesTouched: stats.messagesTouched },
      bytesBefore: stats.bytesBefore,
      bytesAfter: stats.bytesAfter,
      // Same reason as RTK: the underlying function reports a count, not positions.
      touchedIndices: null,
      native: stats,
    };
  },
};
