// Compact find/fd output.
// Group by parent dir, show basenames, cap 10/dir and 20 dirs total
import { FIND_PER_DIR_MAX, FIND_TOTAL_DIR_MAX } from "../constants.ts";
import type { FilterFn } from "../types.ts";

export const find: FilterFn = function find(input) {
  const lines = input.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return input;

  const byDir = new Map();

  for (const path of lines) {
    const lastSlash = path.lastIndexOf("/");
    let dir;
    let basename;
    if (lastSlash === -1) {
      dir = ".";
      basename = path;
    } else {
      // Split into parent dir + basename
      dir = path.slice(0, lastSlash) || "/";
      basename = path.slice(lastSlash + 1);
    }
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(basename);
  }

  // Sort dirs lexicographically
  const dirs = Array.from(byDir.keys()).sort();
  let out = `${lines.length} files in ${dirs.length} dirs:\n\n`;

  const showDirs = dirs.slice(0, FIND_TOTAL_DIR_MAX);
  for (const dir of showDirs) {
    const files = byDir.get(dir);
    out += `${dir}/  (${files.length})\n`;
    const showFiles = files.slice(0, FIND_PER_DIR_MAX);
    for (const f of showFiles) out += `  ${f}\n`;
    if (files.length > FIND_PER_DIR_MAX) {
      out += `  +${files.length - FIND_PER_DIR_MAX}\n`;
    }
  }
  if (dirs.length > FIND_TOTAL_DIR_MAX) {
    out += `\n+${dirs.length - FIND_TOTAL_DIR_MAX} more dirs\n`;
  }

  return out;
};

(find as FilterFn).filterName = "find";
