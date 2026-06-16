// Compact tree output.
// Removes summary line (e.g. "5 directories, 23 files") and trailing blanks.
import { TREE_MAX_LINES } from "../constants.ts";
import type { FilterFn } from "../types.ts";

export const tree: FilterFn = function tree(input) {
  const lines = input.split("\n");
  if (lines.length === 0) return input;

  const filtered = [];
  for (const line of lines) {
    // Drop "X directories, Y files" summary
    if (line.includes("director") && line.includes("file")) continue;
    // Drop leading blanks
    if (line.trim() === "" && filtered.length === 0) continue;
    filtered.push(line);
  }

  // Drop trailing blanks
  while (filtered.length > 0 && filtered[filtered.length - 1].trim() === "") {
    filtered.pop();
  }

  // Cap overly long trees
  if (filtered.length > TREE_MAX_LINES) {
    const cut = filtered.length - TREE_MAX_LINES;
    return filtered.slice(0, TREE_MAX_LINES).join("\n") + `\n... +${cut} more lines`;
  }

  return filtered.join("\n");
};

(tree as FilterFn).filterName = "tree";
