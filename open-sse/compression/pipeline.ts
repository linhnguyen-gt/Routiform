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
   * Optional override for what the caveman-output gates (forced tool_choice /
   * structured output) inspect. Historically needed because the real caller
   * ran `applyStackedCompression` on the POST-translation body, where format
   * translation had already transformed `tool_choice` (OpenAI's string
   * `"auto"` -> Claude's `{type:"auto"}`) or consumed `response_format` into
   * the system prompt. The real caller now runs this stack on the INBOUND
   * (pre-translation) body instead, so `body` and the gate target are the
   * same object and this option is no longer needed there — it remains for
   * direct callers/tests that want to gate against a different body than the
   * one being mutated. Omit to gate against `body` itself.
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

  const cavemanOutput = injectCavemanOutputDirective(
    body,
    cavemanOutputLevel,
    options.cavemanOutputGateBody
  );
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
