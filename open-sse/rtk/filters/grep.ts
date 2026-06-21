// Compact grep output.
// Input format: "file:lineno:content" (split on the first 2 colons).
// In "safe" profile (coding-agent clients) the per-file cap is raised so the
// agent does not believe it saw every match when results were capped.
import { GREP_PER_FILE_MAX, GREP_PER_FILE_MAX_SAFE } from "../constants.ts";
import type { FilterFn, RtkFilterContext } from "../types.ts";

export const grep: FilterFn = function grep(input, ctx?: RtkFilterContext) {
  const perFileMax = ctx && ctx.profile === "safe" ? GREP_PER_FILE_MAX_SAFE : GREP_PER_FILE_MAX;

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
    const show = matches.slice(0, perFileMax);
    for (const [lineNum, content] of show) {
      // Right-pad the line number to width 4, trim the content
      out += `  ${lineNum.padStart(4)}: ${content.trim()}\n`;
    }
    if (matches.length > perFileMax) {
      out += `  +${matches.length - perFileMax} more matches not shown — narrow the search pattern or grep specific directories for full results\n`;
    }
    out += "\n";
  }

  return out;
};

(grep as FilterFn).filterName = "grep";
