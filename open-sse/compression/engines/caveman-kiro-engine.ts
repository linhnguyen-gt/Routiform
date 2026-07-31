import { cavemanCompressKiro } from "../caveman-en.ts";
import type { CavemanStats } from "../types.ts";
import type { CompressionEngine, EngineContext, EngineResult } from "../engine-types.ts";

/**
 * Caveman prose rules for Kiro's `conversationState` shape.
 *
 * Kiro was the only inbound shape receiving RTK's tool-result filtering and no prose compression
 * whatsoever — `cavemanCompressMessages` walks `messages`, `input` and `contents`, and Kiro sends
 * none of them. The asymmetry was found while recording the characterization goldens and pinned
 * there as current behaviour before being closed here.
 *
 * A separate engine rather than a wider `caveman-en`, for the reason that has governed every
 * engine added since the registry landed: `caveman-en` ships in the default preset, so teaching it
 * a new shape would change what every existing Kiro install sends the moment it upgrades. This
 * engine has not cleared the fidelity gate, so it runs only under `aggressive` or an explicit
 * toggle, and Kiro traffic stays byte-identical until someone measures it.
 *
 * Lossy for the same reason `caveman-en` is: it removes English filler from prose.
 */
export const cavemanKiroEngine: CompressionEngine = {
  id: "caveman-kiro",
  stage: "lossy",
  order: 110,
  gateCleared: false,

  supports(ctx: EngineContext): boolean {
    return ctx.bodyShape === "kiro";
  },

  apply(body: Record<string, unknown>): Omit<EngineResult, "reverted"> {
    const stats: CavemanStats | null = cavemanCompressKiro(body);

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
      // Kiro nests its turns under conversationState with no flat container, so there are no
      // container indices to report and a revert has to restore the whole body.
      touchedIndices: null,
      native: stats,
    };
  },
};
