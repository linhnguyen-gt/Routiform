// Compact `git log` output: keep the commit header and subject, drop the body, the graph
// decoration columns, and any embedded diff from `-p`. `--stat` file-count lines survive.
//
// `git log -p` used to be claimed by the git-diff filter, which sees `diff --git` first and has no
// notion of commit boundaries — so the log read as one long diff and every commit header was
// thrown away. This filter is checked ahead of git-diff for that reason.
import { GIT_LOG_MAX_LINES } from "../constants.ts";
import type { FilterFn } from "../types.ts";

// `commit <sha>`, optionally preceded by --graph glyphs and optionally followed by
// ref decoration like ` (HEAD -> main, origin/main)`.
// {7,64}: SHA-1 repos are 40, SHA-256 repos are 64, and `--abbrev-commit` is shorter.
const COMMIT_LINE = /^[*|\\/ ]*commit ([0-9a-f]{7,64})\b(.*)$/;
const META_LINE = /^[*|\\/ ]*(Author|AuthorDate|Commit|CommitDate|Date|Merge):\s/;
// "3 files changed, 41 insertions(+), 9 deletions(-)" from --stat / --shortstat.
const STAT_SUMMARY = /^[*|\\/ ]*\d+ files? changed(,|$)/;

/**
 * Strip the leading `--graph` decoration so the text is comparable across log styles.
 *
 * The prefix runs up to and including the last glyph, then any padding — which is what makes
 * `| |     Merge branch 'x'` reduce to the subject and `| |` reduce to nothing. A line with no
 * glyph at all (plain `git log`) is returned untouched, so ordinary indentation survives for the
 * callers that trim it themselves.
 */
function stripGraph(line: string): string {
  const prefix = line.match(/^[*|\\/ ]*[*|\\/][ \t]*/);
  return prefix ? line.slice(prefix[0].length) : line;
}

export const gitLog: FilterFn = function gitLog(text, _ctx, maxLines: unknown = GIT_LOG_MAX_LINES) {
  const cap = typeof maxLines === "number" && maxLines > 0 ? maxLines : GIT_LOG_MAX_LINES;
  const result: string[] = [];

  let inCommit = false;
  let subjectTaken = false;
  let commitsSeen = 0;
  let commitsKept = 0;
  let capped = false;

  for (const raw of text.split("\n")) {
    if (COMMIT_LINE.test(raw)) {
      commitsSeen += 1;
      inCommit = true;
      subjectTaken = false;
      if (result.length >= cap) {
        capped = true;
        continue;
      }
      commitsKept += 1;
      result.push(stripGraph(raw));
      continue;
    }

    if (!inCommit || capped) continue;

    if (META_LINE.test(raw)) {
      result.push(stripGraph(raw));
      continue;
    }

    if (STAT_SUMMARY.test(raw)) {
      result.push(`  ${stripGraph(raw).trim()}`);
      continue;
    }

    if (subjectTaken) continue;

    // First non-blank line after the headers is the subject; everything after it is body,
    // per-file --stat rows, or diff, and is dropped.
    const body = stripGraph(raw).trim();
    if (body.length === 0) continue;
    if (body.startsWith("diff --git")) {
      subjectTaken = true;
      continue;
    }
    result.push(`  ${body}`);
    subjectTaken = true;
  }

  if (commitsSeen > commitsKept) {
    result.push(`... ${commitsSeen - commitsKept} more commits omitted`);
  }

  return result.join("\n");
};

(gitLog as FilterFn).filterName = "git-log";
