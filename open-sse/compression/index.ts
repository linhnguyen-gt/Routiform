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
export { applyInflationGuard, measureBodyBytes, snapshotBody } from "./inflation-guard.ts";
export type {
  CompressionStackMode,
  CavemanStats,
  CavemanOutputLevel,
  CavemanOutputTarget,
  CavemanOutputResult,
  StackCompressionResult,
} from "./types.ts";
