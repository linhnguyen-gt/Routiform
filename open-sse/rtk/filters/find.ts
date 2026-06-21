// Compact find/fd output.
// Group by parent dir, show basenames, cap per-dir and total dirs.
// In "safe" profile (coding-agent clients) caps are raised so the agent
// receives a more complete listing for refactors.
import {
  FIND_PER_DIR_MAX,
  FIND_TOTAL_DIR_MAX,
  FIND_PER_DIR_MAX_SAFE,
  FIND_TOTAL_DIR_MAX_SAFE,
} from "../constants.ts";
import type { FilterFn, RtkFilterContext } from "../types.ts";

export const find: FilterFn = function find(input, ctx?: RtkFilterContext) {
  const safe = ctx && ctx.profile === "safe";
  const perDirMax = safe ? FIND_PER_DIR_MAX_SAFE : FIND_PER_DIR_MAX;
  const totalDirMax = safe ? FIND_TOTAL_DIR_MAX_SAFE : FIND_TOTAL_DIR_MAX;

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

  const showDirs = dirs.slice(0, totalDirMax);
  for (const dir of showDirs) {
    const files = byDir.get(dir);
    out += `${dir}/  (${files.length})\n`;
    const showFiles = files.slice(0, perDirMax);
    for (const f of showFiles) out += `  ${f}\n`;
    if (files.length > perDirMax) {
      out += `  +${files.length - perDirMax} more files not shown — search within a specific subdirectory for complete listing\n`;
    }
  }
  if (dirs.length > totalDirMax) {
    out += `\n+${dirs.length - totalDirMax} more directories not shown — narrow the search scope for complete listing\n`;
  }

  return out;
};

(find as FilterFn).filterName = "find";
