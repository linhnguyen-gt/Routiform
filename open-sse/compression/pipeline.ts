import { formatRtkLog } from "../rtk/index.ts";
import type { RtkProfile, RtkStats } from "../rtk/types.ts";
import { resolveRtkProfile } from "../rtk/profile-resolver.ts";
import { formatCavemanLog } from "./caveman-en.ts";
import { formatCavemanOutputLog, injectCavemanOutputDirective } from "./caveman-output.ts";
import { applyInflationGuard, measureBodyBytes, snapshotAndMeasure } from "./inflation-guard.ts";
import { detectBodyShape } from "./engine-types.ts";
import type { EngineContext, EngineResult } from "./engine-types.ts";
import { selectEngines } from "./registry.ts";
import { runEngine } from "./run-engine.ts";
import type { CompressionPreset } from "./preset.ts";
import type { CavemanOutputLevel, CavemanStats, StackCompressionResult } from "./types.ts";

export type StackOptions = {
  enabled: boolean;
  userAgent?: string | null;
  /** When true (default), run Caveman EN after RTK when compression is enabled. */
  caveman?: boolean;
  /**
   * Which engine set to run. Absent means the caller has not adopted presets yet, in which case
   * `enabled` + `caveman` reproduce the historical RTK-then-Caveman stack exactly.
   */
  preset?: CompressionPreset;
  /** Per-engine toggles, read only under the `custom` preset. */
  engineToggles?: Record<string, boolean> | null;
  /** Conversation identity for engines that key on it. Never fabricated; null when unknown. */
  conversationId?: string | null;
  /** Tenant dimension for engines that key on it. */
  apiKeyId?: string | null;
  provider?: string;
  model?: string;
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
  /** Per-engine outcome, keyed by engine id. */
  engines: Record<string, EngineResult>;
};

/**
 * Registry-driven compression: lossless engines, then lossy, then the inflation guard, then the
 * output-side Caveman directive.
 *
 * The output directive is deliberately NOT an engine. It is a system-prompt injection rather than
 * a byte transform on the request, it runs after the guard, and it runs even when the input-side
 * stack is off — three properties an engine does not have.
 *
 * The legacy result fields (`mode`, `rtkHits`, `caveman`, `rtkStats`) are derived from engine
 * results rather than removed: 64 existing tests and the MCP surface read them, and a registry
 * that forces every consumer to change is a registry nobody adopts.
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
      engines: {},
      logs,
    };
  }

  const ctx: EngineContext = {
    provider: options.provider ?? "unknown",
    model: typeof body.model === "string" ? body.model : (options.model ?? "unknown"),
    userAgent: options.userAgent ?? null,
    rtkProfile,
    bodyShape: detectBodyShape(body),
    conversationId: options.conversationId ?? null,
    apiKeyId: options.apiKeyId ?? null,
    touchedSoFar: new Set<number>(),
  };

  // `caveman: false` is the historical way to ask for RTK without Caveman, and it predates
  // presets. Honour it by narrowing the selection rather than by branching in the loop.
  const preset: CompressionPreset = options.preset ?? "balanced";
  let chosen = selectEngines(preset, ctx, options.engineToggles);
  if (!cavemanOn) chosen = chosen.filter((engine) => engine.stage !== "lossy");

  // One whole-body snapshot for the whole run, taken in a single serialization that also yields
  // the starting size. It is both the global backstop's reference and the first engine's revert
  // point, so per-engine guarding adds no clone of its own here.
  const { snapshot, bytes: bytesBefore } = snapshotAndMeasure(body);

  const engines: Record<string, EngineResult> = {};
  let previous = snapshot;
  let running = bytesBefore;

  for (let i = 0; i < chosen.length; i++) {
    const engine = chosen[i];
    const outcome = runEngine(engine, body, ctx, {
      previous,
      bytesBefore: running,
      advancePrevious: i < chosen.length - 1,
    });
    if (outcome.skipped) continue;
    engines[engine.id] = outcome.result;
    previous = outcome.previous;
    running = outcome.bytesAfter;
    // A reverted engine left nothing behind, so its indices must not be reported as rewritten —
    // a later engine skipping them would decline to compress content that is still untouched.
    if (outcome.result.applied && !outcome.result.reverted) {
      for (const index of outcome.result.touchedIndices ?? []) ctx.touchedSoFar.add(index);
    }
  }

  // Legacy fields come from each engine's own stats object, untouched. Deriving them from the
  // registry's flat scalar map instead would change their shape, and these are read by 64 tests
  // and by the MCP surface.
  const rtkResult = engines.rtk;
  const rtkStats = (rtkResult?.native as RtkStats | null | undefined) ?? null;

  const cavemanResult = engines["caveman-en"];
  const caveman = cavemanResult?.applied
    ? ((cavemanResult.native as CavemanStats | null | undefined) ?? null)
    : null;

  const rtkLine = formatRtkLog(rtkStats);
  if (rtkLine) logs.push(rtkLine);
  const cavLine = formatCavemanLog(caveman);
  if (cavLine) logs.push(cavLine);

  // Global backstop, unchanged. Per-engine guards catch an engine that inflates on its own; this
  // catches the case where each engine shrank its own scope and the total still grew.
  const { reverted, bytesAfter } = applyInflationGuard(body, snapshot, bytesBefore, running);
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
    engines,
    logs,
  };
}

/**
 * The `X-Routiform-Compression` header value.
 *
 * Carries per-engine segments now that several engines can run: "which engines ran and what each
 * saved" is the question an operator actually has, and a single total cannot answer it.
 */
export function formatStackHeader(result: StackApplyResult): string {
  if (result.mode === "off") {
    return result.inflationReverted ? "off; source=inflation-guard" : "off; source=disabled";
  }
  const saved = Math.max(0, result.bytesBefore - result.bytesAfter);
  const segments = Object.entries(result.engines ?? {})
    .filter(([, r]) => r.applied)
    .map(
      ([id, r]) => `${id}=${r.reverted ? "reverted" : Math.max(0, r.bytesBefore - r.bytesAfter)}`
    );
  const enginePart = segments.length > 0 ? `; engines=${segments.join(",")}` : "";
  return `${result.mode}; source=settings; saved=${saved}${enginePart}`;
}
