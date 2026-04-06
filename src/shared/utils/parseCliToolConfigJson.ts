import JSON5 from "json5";

/**
 * Parse CLI tool config files on disk. Many tools (Claude Code, etc.) accept JSONC
 * (comments and trailing commas) where strict JSON.parse would fail.
 */
export function parseCliToolConfigJson(content: string): unknown {
  return JSON5.parse(content);
}
