import { compressMessages } from "../../rtk/index.ts";
import type { CompressionEngine, EngineContext } from "../engine-types.ts";

/**
 * RTK as a registry entry. Lossless: it filters tool-result payloads (truncating long file
 * reads, capping grep output) without touching prose or code the model authored.
 *
 * Order 100 preserves its position from the hardcoded pipeline.
 *
 * Two deliberate choices here, both about not overclaiming:
 *
 * - `bytesBefore/After` are RTK's OWN figures, over the regions it rewrote — not whole-body
 *   measurements. An engine that serialized the entire payload to report on itself would add a
 *   multi-MB serialization per engine to the hot path; the runner measures the body once per
 *   engine for the guard and that is the only whole-body cost.
 * - `touchedIndices: null` means "scope unknown", not "touched nothing". `compressMessages`
 *   mutates in place through code this wrapper does not own and reports no index information,
 *   so a scope claim here would be unbacked. Null costs a whole-body revert on inflation,
 *   which is exactly what happened before the registry existed.
 */
export const rtkEngine: CompressionEngine = {
  id: "rtk",
  stage: "lossless",
  order: 100,
  gateCleared: true,

  supports(ctx: EngineContext): boolean {
    // The profile resolver already decided this request gets no RTK.
    return ctx.rtkProfile !== "off";
  },

  apply(body: Record<string, unknown>, ctx: EngineContext) {
    const stats = compressMessages(body, ctx.rtkProfile);
    const hits = stats?.hits?.length ?? 0;

    if (!stats || hits === 0) {
      return {
        applied: false,
        stats: { hits: 0 },
        bytesBefore: stats?.bytesBefore ?? 0,
        bytesAfter: stats?.bytesAfter ?? 0,
        touchedIndices: [],
        native: stats,
      };
    }

    return {
      applied: true,
      stats: { hits },
      bytesBefore: stats.bytesBefore,
      bytesAfter: stats.bytesAfter,
      touchedIndices: null,
      native: stats,
    };
  },
};
