import test from "node:test";
import assert from "node:assert/strict";

/**
 * `git log -p` used to be claimed by the git-diff filter — it sees `diff --git` and has no notion
 * of commit boundaries, so the commit headers were discarded and the diff was kept. The git-log
 * detector runs ahead of it and inverts that: headers and subjects survive, the diff does not.
 */

const { autoDetectFilter } = await import("../../open-sse/rtk/autodetect.ts");
const { gitLog } = await import("../../open-sse/rtk/filters/git-log.ts");
const { gitDiff } = await import("../../open-sse/rtk/filters/git-diff.ts");

const CTX = { profile: "full" };

const PLAIN_LOG = `commit 4f2a1b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a (HEAD -> main, origin/main)
Author: Linh Nguyen <dev@example.com>
Date:   Mon Aug 3 09:05:00 2026 +0700

    fix(auth): keep gateway API keys out of host-credential routes

    A gateway API key satisfied every management route, including one that
    persisted a string later passed to a shell. This is the first half of the
    fix; the rest lands with the route audit.

    Refs: #517

commit 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b
Author: Linh Nguyen <dev@example.com>
Date:   Sun Aug 2 18:40:00 2026 +0700

    feat(compression): give Kiro bodies the prose compression they never had
`;

test("plain git log keeps headers and the subject, drops the body", () => {
  assert.equal(autoDetectFilter(PLAIN_LOG), gitLog);

  const out = gitLog(PLAIN_LOG, CTX);
  assert.match(out, /commit 4f2a1b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a/);
  assert.match(out, /Author: Linh Nguyen/);
  assert.match(out, /Date: {3}Mon Aug 3/);
  assert.match(out, /fix\(auth\): keep gateway API keys out of host-credential routes/);

  assert.ok(!out.includes("This is the first half"), "the commit body must be dropped");
  assert.ok(!out.includes("Refs: #517"), "trailers are body, not subject");
  assert.match(out, /feat\(compression\): give Kiro bodies/);
});

function buildCommitWithDiff(index) {
  const sha = index.toString(16).padStart(40, "0");
  const hunk = Array.from(
    { length: 40 },
    (_, i) => `+  const value${i} = compute(${i}); // generated padding line ${i}`
  ).join("\n");
  return `commit ${sha}
Author: Linh Nguyen <dev@example.com>
Date:   Mon Aug 3 09:0${index % 10}:00 2026 +0700

    refactor(core): step ${index}

    A body paragraph nobody needs in a log summary, repeated for bulk so the
    ratio assertion below measures something real.

diff --git a/src/step-${index}.ts b/src/step-${index}.ts
index 1111111..2222222 100644
--- a/src/step-${index}.ts
+++ b/src/step-${index}.ts
@@ -1,4 +1,44 @@
${hunk}
`;
}

const LOG_WITH_PATCH = Array.from({ length: 20 }, (_, i) => buildCommitWithDiff(i + 1)).join("\n");

test("git log -p routes to git-log, not git-diff", () => {
  assert.equal(
    autoDetectFilter(LOG_WITH_PATCH),
    gitLog,
    "the detector must not hand a patch-formatted log to git-diff"
  );
  assert.notEqual(autoDetectFilter(LOG_WITH_PATCH), gitDiff);
});

test("git log -p drops the diff body and shrinks by at least 70%", () => {
  const out = gitLog(LOG_WITH_PATCH, CTX);

  assert.ok(!out.includes("diff --git"), "the diff header must be dropped");
  assert.ok(!out.includes("@@ -1,4"), "hunk headers must be dropped");
  assert.ok(!out.includes("generated padding line"), "hunk content must be dropped");
  assert.match(out, /refactor\(core\): step 1$/m, "the subject must survive");

  const ratio = out.length / LOG_WITH_PATCH.length;
  assert.ok(
    ratio <= 0.3,
    `expected >=70% reduction, got ${(100 - ratio * 100).toFixed(1)}% (${LOG_WITH_PATCH.length} -> ${out.length} bytes)`
  );
});

const LOG_WITH_STAT = `commit aaaaaaabbbbbbbcccccccdddddddeeeeeeefffffff
Author: Linh Nguyen <dev@example.com>
Date:   Mon Aug 3 09:05:00 2026 +0700

    chore(deps): bump the toolchain

 package.json      |  4 ++--
 package-lock.json | 88 ++++++++++++++++++++++----------------------
 tsconfig.json     |  2 +-
 3 files changed, 47 insertions(+), 47 deletions(-)
`;

test("git log --stat keeps the file-count summary and drops the per-file rows", () => {
  assert.equal(autoDetectFilter(LOG_WITH_STAT), gitLog);

  const out = gitLog(LOG_WITH_STAT, CTX);
  assert.match(out, /3 files changed, 47 insertions\(\+\), 47 deletions\(-\)/);
  assert.ok(!out.includes("package-lock.json |"), "per-file rows are noise");
  assert.match(out, /chore\(deps\): bump the toolchain/);
});

const LOG_WITH_GRAPH = `*   commit 9999999888888877777776666666555555544444443
|\\  Merge: 1111111 2222222
| | Author: Linh Nguyen <dev@example.com>
| | Date:   Mon Aug 3 09:05:00 2026 +0700
| |
| |     Merge branch 'feature/x' into main
| |
| * commit 2222222333333344444445555555666666677777778
|/  Author: Linh Nguyen <dev@example.com>
|   Date:   Sun Aug 2 12:00:00 2026 +0700
|
|       feat(x): add the thing
`;

test("--graph glyphs do not defeat detection and are stripped", () => {
  assert.equal(autoDetectFilter(LOG_WITH_GRAPH), gitLog);

  const out = gitLog(LOG_WITH_GRAPH, CTX);
  assert.match(out, /^commit 9999999888888877777776666666555555544444443$/m);
  assert.match(out, /Merge: 1111111 2222222/);
  assert.match(out, /Merge branch 'feature\/x' into main/);
  assert.match(out, /feat\(x\): add the thing/);
});

test("prose mentioning a commit is not claimed by git-log", () => {
  const prose = `I will commit this change once the review lands.
The commit message should mention the ticket.
Please do not commit secrets to the repository.
Every commit needs a subject line under 72 characters.
Reviewers usually ask for one commit per logical change.
`;
  assert.notEqual(autoDetectFilter(prose), gitLog);
});

test("plain git diff still routes to git-diff", () => {
  const diff = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,3 @@
-const a = 1;
+const a = 2;
`;
  assert.equal(autoDetectFilter(diff), gitDiff);
});

test("the cap emits an explicit omitted-commits trailer", () => {
  const many = Array.from(
    { length: 400 },
    (_, i) =>
      `commit ${i.toString(16).padStart(40, "0")}\nAuthor: A <a@example.com>\nDate:   Mon Aug 3 09:05:00 2026 +0700\n\n    subject ${i}\n`
  ).join("\n");

  const out = gitLog(many, CTX);
  assert.match(out, /\.\.\. \d+ more commits omitted$/m);
  assert.ok(out.length < many.length);
});

test("the filter tags itself so the profile gate and stats can name it", () => {
  assert.equal(gitLog.filterName, "git-log");
});
