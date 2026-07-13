import { compressMessages, formatRtkLog } from "../rtk/index.ts";
import type { RtkProfile, RtkStats } from "../rtk/types.ts";
import { resolveRtkProfile } from "../rtk/profile-resolver.ts";
import { cavemanCompressMessages, formatCavemanLog } from "./caveman-en.ts";
import { formatCavemanOutputLog, injectCavemanOutputDirective } from "./caveman-output.ts";
import { applyInflationGuard, measureBodyBytes, snapshotBody } from "./inflation-guard.ts";
import type { CavemanOutputLevel, StackCompressionResult } from "./types.ts";

export type StackOptions = {
  enabled: boolean;
  userAgent?: string | null;
  /** When true (default), run Caveman EN after RTK when compression is enabled. */
  caveman?: boolean;
  /**
   * Output-side caveman: injects a terseness directive into the system
   * prompt so the *model* replies with fewer output tokens. Default `"off"`
   * — independent of `enabled`/`caveman` (input-side stack), so it keeps
   * working even when the request-compaction stack is disabled.
   */
  cavemanOutputLevel?: CavemanOutputLevel;
  /**
   * The INBOUND client request body (pre format-translation), used only to
   * gate the caveman-output directive (forced tool_choice / structured
   * output). `body` passed to `applyStackedCompression` is the translated
   * body that actually goes upstream — by the time it reaches this stack,
   * format translation has already transformed `tool_choice` (e.g. OpenAI's
   * string `"auto"` becomes the Claude object `{type:"auto"}`) or consumed
   * `response_format` into the system prompt and dropped it from the body.
   * Gating against the translated body misfires both ways. Omit to gate
   * against `body` itself (matches pre-existing direct-call behavior).
   */
  cavemanOutputGateBody?: Record<string, unknown> | null;
};

export type StackApplyResult = StackCompressionResult & {
  rtkStats: RtkStats | null;
  rtkProfile: RtkProfile;
  logs: string[];
};

/**
 * RTK → Caveman (EN) → inflation guard → Caveman Output.
 * Mutates `body` in place. Restores snapshot if the input-side stack grows
 * the payload. The output-side directive (last stage) is a system-prompt
 * injection, not a byte transform, so it is never subject to the inflation
 * guard and runs regardless of whether the input-side stack is enabled.
 */
export function applyStackedCompression(
  body: Record<string, unknown>,
  options: StackOptions
): StackApplyResult {
  const logs: string[] = [];
  const rtkProfile = resolveRtkProfile(options.enabled, options.userAgent);
  const cavemanOn = options.enabled && options.caveman !== false;
  const cavemanOutputLevel: CavemanOutputLevel = options.cavemanOutputLevel ?? "off";

  if (!options.enabled || rtkProfile === "off") {
    const cavemanOutput = injectCavemanOutputDirective(
      body,
      cavemanOutputLevel,
      options.cavemanOutputGateBody
    );
    const outputLine = formatCavemanOutputLog(cavemanOutput);
    if (outputLine) logs.push(outputLine);

    return {
      mode: "off",
      rtkHits: 0,
      rtkStats: null,
      rtkProfile: "off",
      caveman: null,
      cavemanOutput,
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

  const cavemanOutput = injectCavemanOutputDirective(body, cavemanOutputLevel);
  const outputLine = formatCavemanOutputLog(cavemanOutput);
  if (outputLine) logs.push(outputLine);

  const mode = cavemanOn ? "stacked" : "rtk";
  return {
    mode: reverted ? "off" : mode,
    rtkHits: rtkStats?.hits?.length ?? 0,
    rtkStats,
    rtkProfile,
    caveman: reverted ? null : caveman,
    cavemanOutput,
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
