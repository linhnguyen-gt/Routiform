// Smart truncate fallback.
// Keep HEAD + TAIL lines, replace middle with "... +N lines truncated".
import {
  SMART_TRUNCATE_HEAD,
  SMART_TRUNCATE_TAIL,
  SMART_TRUNCATE_MIN_LINES,
} from "../constants.ts";
import type { FilterFn } from "../types.ts";

export const smartTruncate: FilterFn = function smartTruncate(input) {
  const lines = input.split("\n");
  if (lines.length < SMART_TRUNCATE_MIN_LINES) return input;

  const head = lines.slice(0, SMART_TRUNCATE_HEAD);
  const tail = lines.slice(lines.length - SMART_TRUNCATE_TAIL);
  const cut = lines.length - head.length - tail.length;
  return [...head, `... +${cut} lines truncated`, ...tail].join("\n");
};

(smartTruncate as FilterFn).filterName = "smart-truncate";
