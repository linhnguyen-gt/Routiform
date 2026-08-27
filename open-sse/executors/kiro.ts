/**
 * Kiro executor — public entry point.
 *
 * Implementation lives in ./kiro/*; this module keeps the historical
 * import path (`executors/kiro.ts`) stable for the registry and tests.
 */
export { KiroExecutor, default } from "./kiro/executor.ts";
export type {
  EventFrame,
  JsonRecord,
  KiroStreamRuntime,
  KiroStreamState,
  UsageSummary,
} from "./kiro/types.ts";
export { parseEventFrame } from "./kiro/event-frame.ts";
export { stripThinkingTags } from "./kiro/thinking-tags.ts";
export { buildKiroHeaders, buildKiroUrl, transformKiroRequest } from "./kiro/request.ts";
export { transformKiroEventStreamToSSE } from "./kiro/event-stream.ts";
