export { applyStackedCompression, formatStackHeader } from "./pipeline.ts";
export type { StackOptions, StackApplyResult } from "./pipeline.ts";
export { cavemanCompressMessages, formatCavemanLog } from "./caveman-en.ts";
export {
  CAVEMAN_LEVELS,
  CAVEMAN_PROMPTS,
  getCavemanOutputPrompt,
  injectCavemanOutputDirective,
  formatCavemanOutputLog,
} from "./caveman-output.ts";
export { PONYTAIL_PROMPT, injectPonytailDirective, formatPonytailLog } from "./ponytail-prompt.ts";
export { canInjectSystemDirective } from "./directive-gates.ts";
export { appendSystemDirective } from "./append-system-directive.ts";
export {
  applyInflationGuard,
  measureBodyBytes,
  resolveCompressionBodies,
  snapshotAndMeasure,
  snapshotBody,
} from "./inflation-guard.ts";
export {
  getEngine,
  listEngines,
  registerEngine,
  resetRegistryToBuiltins,
  selectEngines,
  BUILTIN_ENGINE_IDS,
} from "./registry.ts";
export { runEngine } from "./run-engine.ts";
export {
  presetEngines,
  resolvePreset,
  COMPRESSION_PRESETS,
  DEFAULT_COMPRESSION_PRESET,
} from "./preset.ts";
export type { CompressionPreset } from "./preset.ts";
export { ENGINE_CATALOG, CATALOG_ENGINE_IDS } from "./engine-catalog.ts";
export type { EngineDescriptor } from "./engine-catalog.ts";
export { detectBodyShape, resolveContainer } from "./engine-types.ts";
export type {
  BodyShape,
  CompressionEngine,
  EngineContext,
  EngineResult,
  EngineStage,
} from "./engine-types.ts";
export type {
  CompressionStackMode,
  CavemanStats,
  CavemanOutputLevel,
  CavemanOutputTarget,
  CavemanOutputResult,
  PonytailOutputMode,
  PonytailOutputResult,
  StackCompressionResult,
} from "./types.ts";
