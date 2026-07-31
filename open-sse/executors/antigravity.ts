/**
 * Antigravity executor — public entry point.
 *
 * Implementation lives in ./antigravity/*; this module keeps the historical
 * import path (`executors/antigravity.ts`) stable for the registry and tests.
 */
export { AntigravityExecutor, default } from "./antigravity/executor.ts";
export type {
  AntigravityCredentials,
  AntigravityExecuteInput,
  AntigravityRequestBody,
  ExecutorResult,
} from "./antigravity/types.ts";
