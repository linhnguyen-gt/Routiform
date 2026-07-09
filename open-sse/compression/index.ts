export { applyStackedCompression, formatStackHeader } from "./pipeline.ts";
export type { StackOptions, StackApplyResult } from "./pipeline.ts";
export { cavemanCompressMessages, formatCavemanLog } from "./caveman-en.ts";
export { applyInflationGuard, measureBodyBytes, snapshotBody } from "./inflation-guard.ts";
export type { CompressionStackMode, CavemanStats, StackCompressionResult } from "./types.ts";
