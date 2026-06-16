// Auto-detect the right filter for a tool_result blob by inspecting its head.
// Order: git-diff → git-status → build-output → grep → find → tree → ls → search-list
//        → read-numbered → dedup-log → smart-truncate → null
import {
  DETECT_WINDOW,
  READ_NUMBERED_MIN_HIT_RATIO,
  SMART_TRUNCATE_MIN_LINES,
} from "./constants.ts";
import { gitDiff } from "./filters/git-diff.ts";
import { gitStatus } from "./filters/git-status.ts";
import { buildOutput } from "./filters/build-output.ts";
import { grep } from "./filters/grep.ts";
import { find } from "./filters/find.ts";
import { dedupLog } from "./filters/dedup-log.ts";
import { ls } from "./filters/ls.ts";
import { tree } from "./filters/tree.ts";
import { smartTruncate } from "./filters/smart-truncate.ts";
import { readNumbered, READ_NUMBERED_LINE_RE } from "./filters/read-numbered.ts";
import { searchList, SEARCH_LIST_HEADER_RE } from "./filters/search-list.ts";
import type { FilterFn } from "./types.ts";

const RE_GIT_DIFF = /^diff --git /m;
const RE_GIT_DIFF_HUNK = /^@@ /m;
const RE_GIT_STATUS = /^On branch |^nothing to commit|^Changes (not |to be )|^Untracked files:/m;
const RE_PORCELAIN = /^[ MADRCU?!][ MADRCU?!] \S/m;
const RE_BUILD_OUTPUT =
  /^(npm (warn|error|ERR!)|yarn (warn|error)|\s*Compiling\s+\S+|\s*Downloading\s+\S+|added \d+ package|\[ERROR\]|BUILD (SUCCESS|FAILED)|\s*Finished\s+|Successfully (installed|built)|ERROR:)/im;
const RE_TREE_GLYPH = /[├└]──|│  /;
const RE_LS_ROW = /^[-dlbcps][rwx-]{9}/m;
const RE_LS_TOTAL = /^total \d+$/m;

export function autoDetectFilter(text: string): FilterFn | null {
  // JS .slice() by char is UTF-8 safe (no byte-boundary split needed)
  const head = text.length > DETECT_WINDOW ? text.slice(0, DETECT_WINDOW) : text;

  if (RE_GIT_DIFF.test(head) || RE_GIT_DIFF_HUNK.test(head)) return gitDiff;
  if (RE_GIT_STATUS.test(head)) return gitStatus;

  // Build output BEFORE porcelain check: prevents cargo "Compiling" misdetection as git-status
  if (RE_BUILD_OUTPUT.test(head)) return buildOutput;

  if (isMostlyPorcelain(head)) return gitStatus;

  const lines = head.split("\n");
  const nonEmpty = lines.filter((l) => l.trim().length > 0);

  // grep rule: first 5 non-empty lines, ANY matches "file:number:content"
  const first5 = nonEmpty.slice(0, 5);
  if (first5.some(isGrepLine)) return grep;

  // find rule: ALL non-empty lines path-like (no ':'), >=3 lines
  if (nonEmpty.length >= 3 && nonEmpty.every(isPathLike)) return find;

  // Tree: contains box-drawing glyphs typical of `tree` command
  if (RE_TREE_GLYPH.test(head)) return tree;

  // ls -la: has "total N" header or >=3 rows starting with perms string
  if (RE_LS_TOTAL.test(head) || countMatches(head, RE_LS_ROW) >= 3) return ls;

  // Cursor Glob search list header
  if (SEARCH_LIST_HEADER_RE.test(head)) return searchList;

  // Line-numbered file dump ("  N|content") — fire only if many lines match
  if (lines.length >= SMART_TRUNCATE_MIN_LINES && isLineNumbered(lines)) {
    return readNumbered;
  }

  // Fallback: dedupLog for generic multi-line noise with duplicates
  if (nonEmpty.length >= 5) return dedupLog;

  // Last resort: big blob with no structure — smart truncate
  if (text.split("\n").length >= SMART_TRUNCATE_MIN_LINES) return smartTruncate;

  return null;
}

function isGrepLine(line: string): boolean {
  // Split on the first 2 colons; the middle segment must be an integer line number
  const first = line.indexOf(":");
  if (first === -1) return false;
  const second = line.indexOf(":", first + 1);
  if (second === -1) return false;
  const lineno = line.slice(first + 1, second);
  return /^\d+$/.test(lineno);
}

function isPathLike(line: string): boolean {
  const t = line.trim();
  if (t.length === 0) return false;
  if (t.includes(":")) return false;
  return t.startsWith(".") || t.startsWith("/") || t.includes("/");
}

function isMostlyPorcelain(head: string): boolean {
  const lines = head.split("\n").filter((l) => l.trim());
  if (lines.length < 3) return false;
  const hits = lines.filter((l) => RE_PORCELAIN.test(l)).length;
  return hits / lines.length >= 0.6;
}

function isLineNumbered(lines: string[]): boolean {
  let hits = 0;
  let nonEmpty = 0;
  const sample = lines.slice(0, 100);
  for (const l of sample) {
    if (l.length === 0) continue;
    nonEmpty++;
    if (READ_NUMBERED_LINE_RE.test(l)) hits++;
  }
  if (nonEmpty < 5) return false;
  return hits / nonEmpty >= READ_NUMBERED_MIN_HIT_RATIO;
}

function countMatches(text: string, re: RegExp): number {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  return (text.match(g) || []).length;
}
