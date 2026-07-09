import { compressMessages, formatRtkLog } from "../rtk/index.ts";
import type { RtkProfile, RtkStats } from "../rtk/types.ts";
import { resolveRtkProfile } from "../rtk/profile-resolver.ts";
import { cavemanCompressMessages, formatCavemanLog } from "./caveman-en.ts";
import { applyInflationGuard, measureBodyBytes, snapshotBody } from "./inflation-guard.ts";
import type { StackCompressionResult } from "./types.ts";

export type StackOptions = {
  enabled: boolean;
  userAgent?: string | null;
  /** When true (default), run Caveman EN after RTK when compression is enabled. */
  caveman?: boolean;
};

export type StackApplyResult = StackCompressionResult & {
  rtkStats: RtkStats | null;
  rtkProfile: RtkProfile;
  logs: string[];
};

/**
 * RTK → Caveman (EN) → inflation guard.
 * Mutates `body` in place. Restores snapshot if the stack grows the payload.
 */
export function applyStackedCompression(
  body: Record<string, unknown>,
  options: StackOptions
): StackApplyResult {
  const logs: string[] = [];
  const rtkProfile = resolveRtkProfile(options.enabled, options.userAgent);
  const cavemanOn = options.enabled && options.caveman !== false;

  if (!options.enabled || rtkProfile === "off") {
    return {
      mode: "off",
      rtkHits: 0,
      rtkStats: null,
      rtkProfile: "off",
      caveman: null,
      inflationReverted: false,
      bytesBefore: measureBodyBytes(body),
      bytesAfter: measureBodyBytes(body),
      logs,
    };
  }

  const snapshot = snapshotBody(body);
  const bytesBefore = measureBodyBytes(body);

  const rtkStats = compressMessages(body, rtkProfile);
  const rtkLine = formatRtkLog(rtkStats);
  if (rtkLine) logs.push(rtkLine);

  let caveman = null;
  if (cavemanOn) {
    caveman = cavemanCompressMessages(body);
    const cavLine = formatCavemanLog(caveman);
    if (cavLine) logs.push(cavLine);
  }

  const { reverted, bytesAfter } = applyInflationGuard(body, snapshot, bytesBefore);
  if (reverted) {
    logs.push("[Compression] inflation guard restored original body");
  }

  const mode = cavemanOn ? "stacked" : "rtk";
  return {
    mode: reverted ? "off" : mode,
    rtkHits: rtkStats?.hits?.length ?? 0,
    rtkStats,
    rtkProfile,
    caveman: reverted ? null : caveman,
    inflationReverted: reverted,
    bytesBefore,
    bytesAfter,
    logs,
  };
}

export function formatStackHeader(result: StackApplyResult): string {
  if (result.mode === "off") {
    return result.inflationReverted ? "off; source=inflation-guard" : "off; source=disabled";
  }
  return `${result.mode}; source=settings; saved=${Math.max(0, result.bytesBefore - result.bytesAfter)}`;
}
