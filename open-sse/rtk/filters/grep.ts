// Compact grep output.
// Input format: "file:lineno:content" (split on the first 2 colons).
import { GREP_PER_FILE_MAX } from "../constants.ts";
import type { FilterFn } from "../types.ts";

export const grep: FilterFn = function grep(input) {
  const byFile = new Map();
  let total = 0;

  for (const line of input.split("\n")) {
    // splitn(3, ':') — only split on first 2 colons
    const first = line.indexOf(":");
    if (first === -1) continue;
    const second = line.indexOf(":", first + 1);
    if (second === -1) continue;
    const file = line.slice(0, first);
    const lineNumStr = line.slice(first + 1, second);
    const content = line.slice(second + 1);
    // Middle segment must be an integer line number
    if (!/^\d+$/.test(lineNumStr)) continue;
    total++;
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push([lineNumStr, content]);
  }

  if (total === 0) return input;

  // Sort files lexicographically
  const files = Array.from(byFile.keys()).sort();
  let out = `${total} matches in ${files.length}F:\n\n`;

  for (const file of files) {
    const matches = byFile.get(file);
    out += `[file] ${file} (${matches.length}):\n`;
    const show = matches.slice(0, GREP_PER_FILE_MAX);
    for (const [lineNum, content] of show) {
      // Right-pad the line number to width 4, trim the content
      out += `  ${lineNum.padStart(4)}: ${content.trim()}\n`;
    }
    if (matches.length > GREP_PER_FILE_MAX) {
      out += `  +${matches.length - GREP_PER_FILE_MAX}\n`;
    }
    out += "\n";
  }

  return out;
};

(grep as FilterFn).filterName = "grep";
