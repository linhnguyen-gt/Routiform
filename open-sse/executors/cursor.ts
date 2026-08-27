/**
 * Cursor executor — public entry point.
 *
 * Implementation lives in ./cursor/*; this module keeps the historical import
 * path (`executors/cursor.ts`) stable for the registry and tests.
 */
export { CursorExecutor, default } from "./cursor/executor.ts";
