// Handles Cursor/Codex read_file output: "  1|content\n  2|content".
// Strategy: keep head+tail lines, drop the middle.
import {
  SMART_TRUNCATE_HEAD,
  SMART_TRUNCATE_TAIL,
  SMART_TRUNCATE_MIN_LINES,
} from "../constants.ts";
import type { FilterFn } from "../types.ts";

const LINE_RE = /^\s*\d+\|/;

export const readNumbered: FilterFn = function readNumbered(input) {
  const lines = input.split("\n");
  if (lines.length < SMART_TRUNCATE_MIN_LINES) return input;

  // Count how many lines match "N|content" to verify shape (hit ratio check
  // already done by autodetect; here we just truncate).
  const head = lines.slice(0, SMART_TRUNCATE_HEAD);
  const tail = lines.slice(lines.length - SMART_TRUNCATE_TAIL);
  const cut = lines.length - head.length - tail.length;

  return [...head, `... +${cut} lines truncated (file continues)`, ...tail].join("\n");
};

(readNumbered as FilterFn).filterName = "read-numbered";

// Exposed for autodetect
export const READ_NUMBERED_LINE_RE = LINE_RE;
