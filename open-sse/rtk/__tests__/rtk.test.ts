import { describe, expect, it } from "vitest";

import { autoDetectFilter } from "../autodetect.ts";
import { compressMessages, formatRtkLog } from "../index.ts";
import { resolveRtkProfile } from "../profile-resolver.ts";
import { buildOutput } from "../filters/build-output.ts";
import { dedupLog } from "../filters/dedup-log.ts";
import { find } from "../filters/find.ts";
import { gitDiff } from "../filters/git-diff.ts";
import { gitStatus } from "../filters/git-status.ts";
import { grep } from "../filters/grep.ts";
import { ls } from "../filters/ls.ts";
import { readNumbered } from "../filters/read-numbered.ts";
import { searchList } from "../filters/search-list.ts";
import { smartTruncate } from "../filters/smart-truncate.ts";
import { tree } from "../filters/tree.ts";
import type { RtkFilterContext } from "../types.ts";

function makeLongDiff(fileCount = 2, linesPerFile = 120): string {
  const out: string[] = [];
  for (let f = 0; f < fileCount; f++) {
    out.push(`diff --git a/src/file${f}.js b/src/file${f}.js`);
    out.push(`index abc${f}..def${f} 100644`);
    out.push(`--- a/src/file${f}.js`);
    out.push(`+++ b/src/file${f}.js`);
    out.push(`@@ -1,${linesPerFile} +1,${linesPerFile} @@`);
    for (let i = 0; i < linesPerFile; i++) {
      out.push(`-const old${f}_${i} = "removed value ${i} padding padding padding";`);
      out.push(`+const new${f}_${i} = "added value ${i} padding padding padding padding";`);
    }
  }
  return out.join("\n");
}

function makeGitStatus(): string {
  return [
    "On branch main",
    "Changes not staged for commit:",
    "\tmodified:   src/a.js",
    "\tmodified:   src/b.js",
    "\tdeleted:    src/old.js",
    "Untracked files:",
    "\tnotes.txt",
    "no changes added to commit",
  ].join("\n");
}

function makeGrepOutput(): string {
  const lines: string[] = [];
  for (let i = 1; i <= 40; i++) {
    lines.push(`src/foo.js:${i}:const x${i} = "some value with padding padding padding";`);
  }
  for (let i = 1; i <= 10; i++) {
    lines.push(`src/bar.js:${i}:const y${i} = "another value with padding padding";`);
  }
  return lines.join("\n");
}

function makeFindOutput(): string {
  return [
    ...Array.from({ length: 30 }, (_, i) => `./src/a/${i}.js`),
    ...Array.from({ length: 20 }, (_, i) => `./src/b/${i}.js`),
    ...Array.from({ length: 5 }, (_, i) => `./top${i}.md`),
  ].join("\n");
}

function makeBuildOutput(): string {
  return [
    ...Array.from({ length: 30 }, (_, i) => `   Compiling package-${i} v1.0.${i}`),
    ...Array.from({ length: 8 }, (_, i) => `npm warn deprecated lib-${i}@1.0.0: deprecated`),
    "    Finished `dev` profile [unoptimized + debuginfo] target(s) in 12.34s",
  ].join("\n");
}

function makeLsOutput(): string {
  return [
    "total 48",
    "drwxr-xr-x  2 user staff   64 Jan  1 12:00 .",
    "drwxr-xr-x  2 user staff   64 Jan  1 12:00 ..",
    "drwxr-xr-x  2 user staff   64 Jan  1 12:00 src",
    "drwxr-xr-x  2 user staff   64 Jan  1 12:00 node_modules",
    "-rw-r--r--  1 user staff 1234 Jan  1 12:00 package.json",
    "-rw-r--r--  1 user staff 5678 Jan  1 12:00 README.md",
    "-rw-r--r--  1 user staff 1000 Jan  1 12:00 index.ts",
  ].join("\n");
}

function makeTreeOutput(): string {
  return [
    ".",
    "├── src",
    "│   ├── app.ts",
    "│   └── lib.ts",
    "└── package.json",
    "",
    "2 directories, 3 files",
  ].join("\n");
}

function makeReadNumbered(): string {
  return Array.from({ length: 400 }, (_, i) => `  ${i + 1}|content ${i + 1}`).join("\n");
}

function makeSearchList(): string {
  return [
    "Result of search in '/Users/x' (total 40 files):",
    ...Array.from({ length: 30 }, (_, i) => `- src/a/f${i}.js`),
    ...Array.from({ length: 10 }, (_, i) => `- src/b/g${i}.js`),
  ].join("\n");
}

function expectToolCompression(text: string, filter: string): void {
  const body = { messages: [{ role: "tool", content: text }] };
  const stats = compressMessages(body, "full");
  expect(stats).not.toBeNull();
  expect(stats?.hits[0]?.filter).toBe(filter);
  expect(stats?.bytesAfter).toBeLessThan(stats?.bytesBefore ?? 0);
}

describe("RTK filters", () => {
  it("detects and compresses git diff", () => {
    const input = makeLongDiff();
    expect(autoDetectFilter(input)?.filterName).toBe("git-diff");
    expect(gitDiff(input).length).toBeLessThan(input.length);
    expectToolCompression(input, "git-diff");
  });

  it("detects and compresses git status", () => {
    const input = makeGitStatus().repeat(20);
    expect(autoDetectFilter(input)?.filterName).toBe("git-status");
    expect(gitStatus(input).length).toBeLessThan(input.length);
    expectToolCompression(input, "git-status");
  });

  it("detects and compresses grep output", () => {
    const input = makeGrepOutput();
    expect(autoDetectFilter(input)?.filterName).toBe("grep");
    expect(grep(input).length).toBeLessThan(input.length);
    expectToolCompression(input, "grep");
  });

  it("detects and compresses find output", () => {
    const input = makeFindOutput();
    expect(autoDetectFilter(input)?.filterName).toBe("find");
    expect(find(input).length).toBeLessThan(input.length);
    expectToolCompression(input, "find");
  });

  it("detects and compresses ls output", () => {
    const input = makeLsOutput().repeat(20);
    expect(autoDetectFilter(input)?.filterName).toBe("ls");
    expect(ls(input).length).toBeLessThan(input.length);
    expectToolCompression(input, "ls");
  });

  it("detects and compresses tree output", () => {
    const input = makeTreeOutput().repeat(120);
    expect(autoDetectFilter(input)?.filterName).toBe("tree");
    expect(tree(input).length).toBeLessThan(input.length);
    expectToolCompression(input, "tree");
  });

  it("detects and compresses build output", () => {
    const input = makeBuildOutput();
    expect(autoDetectFilter(input)?.filterName).toBe("build-output");
    expect(buildOutput(input).length).toBeLessThan(input.length);
    expectToolCompression(input, "build-output");
  });

  it("compresses duplicate logs", () => {
    const input = `${Array(50).fill("same log line").join("\n")}\nunique`;
    expect(autoDetectFilter(input)?.filterName).toBe("dedup-log");
    expect(dedupLog(input).length).toBeLessThan(input.length);
    expectToolCompression(input, "dedup-log");
  });

  it("detects and compresses numbered reads", () => {
    const input = makeReadNumbered();
    expect(readNumbered(input).length).toBeLessThan(input.length);
  });

  it("detects and compresses search lists", () => {
    const input = makeSearchList();
    expect(autoDetectFilter(input)?.filterName).toBe("search-list");
    expect(searchList(input).length).toBeLessThan(input.length);
    expectToolCompression(input, "search-list");
  });

  it("smart-truncates large unstructured blobs when called directly", () => {
    const input = Array.from({ length: 400 }, (_, i) => `line ${i}`).join("\n");
    const out = smartTruncate(input);
    expect(out).toContain("lines omitted");
    expect(out).toContain("re-read this section");
    expect(out.length).toBeLessThan(input.length);
  });
});

describe("compressMessages shapes", () => {
  it("compresses OpenAI tool string content", () => {
    const body = { messages: [{ role: "tool", content: makeLongDiff() }] };
    const before = String(body.messages[0].content);
    const stats = compressMessages(body, "full");
    expect(stats?.hits[0]).toMatchObject({ shape: "openai-tool", filter: "git-diff" });
    expect(body.messages[0].content.length).toBeLessThan(before.length);
  });

  it("compresses OpenAI tool array text content", () => {
    const body = {
      messages: [{ role: "tool", content: [{ type: "text", text: makeGrepOutput() }] }],
    };
    const stats = compressMessages(body, "full");
    expect(stats?.hits[0]).toMatchObject({ shape: "openai-tool-array", filter: "grep" });
  });

  it("compresses Claude tool_result string content", () => {
    const body = {
      messages: [{ role: "user", content: [{ type: "tool_result", content: makeFindOutput() }] }],
    };
    const stats = compressMessages(body, "full");
    expect(stats?.hits[0]).toMatchObject({ shape: "claude-string", filter: "find" });
  });

  it("compresses Claude tool_result array text content", () => {
    const body = {
      messages: [
        {
          role: "user",
          content: [{ type: "tool_result", content: [{ type: "text", text: makeBuildOutput() }] }],
        },
      ],
    };
    const stats = compressMessages(body, "full");
    expect(stats?.hits[0]).toMatchObject({ shape: "claude-array", filter: "build-output" });
  });

  it("compresses OpenAI Responses function_call_output strings and arrays", () => {
    const body = {
      input: [
        { type: "function_call_output", output: makeLongDiff() },
        {
          type: "function_call_output",
          output: [{ type: "input_text", text: makeGrepOutput() }],
        },
      ],
    };
    const stats = compressMessages(body, "full");
    expect(stats?.hits.map((hit) => hit.shape)).toEqual([
      "openai-responses-string",
      "openai-responses-array",
    ]);
  });

  it("compresses Kiro currentMessage and history tool results", () => {
    const body = {
      conversationState: {
        currentMessage: {
          userInputMessage: {
            userInputMessageContext: {
              toolResults: [{ status: "success", content: [{ text: makeBuildOutput() }] }],
            },
          },
        },
        history: [
          {
            userInputMessage: {
              userInputMessageContext: {
                toolResults: [{ status: "success", content: [{ text: makeLongDiff() }] }],
              },
            },
          },
        ],
      },
    };
    const stats = compressMessages(body, "full");
    expect(stats?.hits.map((hit) => hit.shape)).toEqual(["kiro-tool-result", "kiro-tool-result"]);
    expect(stats?.hits.map((hit) => hit.filter).sort()).toEqual(["build-output", "git-diff"]);
  });
});

describe("RTK safety gates", () => {
  it("returns null and leaves the body unchanged when disabled", () => {
    const diff = makeLongDiff();
    const body = { messages: [{ role: "tool", content: diff }] };
    expect(compressMessages(body, "off")).toBeNull();
    expect(body.messages[0].content).toBe(diff);
  });

  it("leaves tiny blobs untouched", () => {
    const body = { messages: [{ role: "tool", content: "diff --git a/x b/x\n@@ -1 +1 @@\n+a" }] };
    const before = body.messages[0].content;
    const stats = compressMessages(body, "full");
    expect(stats?.hits).toHaveLength(0);
    expect(body.messages[0].content).toBe(before);
  });

  it("preserves Claude and Kiro error tool results", () => {
    const claudeText = makeLongDiff();
    const kiroText = makeBuildOutput();
    const body = {
      messages: [
        {
          role: "user",
          content: [{ type: "tool_result", is_error: true, content: claudeText }],
        },
      ],
      conversationState: {
        currentMessage: {
          userInputMessage: {
            userInputMessageContext: {
              toolResults: [{ status: "error", content: [{ text: kiroText }] }],
            },
          },
        },
      },
    };
    const claudeStats = compressMessages({ messages: body.messages }, "full");
    const kiroStats = compressMessages({ conversationState: body.conversationState }, "full");
    expect(claudeStats?.hits).toHaveLength(0);
    expect(kiroStats?.hits).toHaveLength(0);
    expect(body.messages[0].content[0].content).toBe(claudeText);
  });

  it("does not replace content when a detected filter would grow output", () => {
    const input = [
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
      "src/d.ts",
      "src/e.ts",
      "src/f.ts",
      "src/g.ts",
      "src/h.ts",
      "src/i.ts",
      "src/j.ts",
      "src/k.ts",
      "src/l.ts",
      "src/m.ts",
      "src/n.ts",
      "src/o.ts",
      "src/p.ts",
      "src/q.ts",
      "src/r.ts",
      "src/s.ts",
      "src/t.ts",
    ].join("\n");
    const body = { messages: [{ role: "tool", content: input }] };
    const stats = compressMessages(body, "full");
    expect(stats?.hits).toHaveLength(0);
    expect(body.messages[0].content).toBe(input);
  });

  it("formats RTK log lines", () => {
    const body = { messages: [{ role: "tool", content: makeLongDiff() }] };
    const line = formatRtkLog(compressMessages(body, "full"));
    expect(line).toMatch(/^\[RTK\] saved \d+B \/ \d+B \([\d.]+%\) via \[git-diff\] hits=1$/);
  });
});

describe("RTK profile resolver", () => {
  it("returns 'off' when compression is disabled", () => {
    expect(resolveRtkProfile(false, "cursor/1.0")).toBe("off");
    expect(resolveRtkProfile(false, null)).toBe("off");
    expect(resolveRtkProfile(false, undefined)).toBe("off");
  });

  it("returns 'safe' for known coding-agent user agents", () => {
    for (const ua of [
      // Real Claude Code sends this exact spelling (see
      // open-sse/services/claudeCodeCompatible.ts CLAUDE_CODE_COMPATIBLE_USER_AGENT).
      "claude-cli/2.1.63 (external, cli)",
      "claude-code/1.0",
      "Claude_Code/2.0",
      "anthropic cli/3.0",
      "openclaw/0.5",
      "hermes/1.2",
      "cursor/0.42",
      "codex/0.1",
      "cline/1.0",
      "roo/1.0",
      "windsurf/1.0",
      "opencode/0.5",
      "continue/0.8",
      "kilocode/1.0",
      "devin/1.0",
    ]) {
      expect(resolveRtkProfile(true, ua)).toBe("safe");
    }
  });

  it("returns 'full' for unknown user agents when compression is enabled", () => {
    expect(resolveRtkProfile(true, "curl/8.0")).toBe("full");
    expect(resolveRtkProfile(true, "Mozilla/5.0 browser")).toBe("full");
  });

  it("returns 'full' when userAgent is null/undefined and compression is enabled", () => {
    expect(resolveRtkProfile(true, null)).toBe("full");
    expect(resolveRtkProfile(true, undefined)).toBe("full");
    expect(resolveRtkProfile(true, "")).toBe("full");
  });
});

describe("RTK safe profile", () => {
  it("skips read-numbered in safe mode (passes content through unchanged)", () => {
    const input = makeReadNumbered();
    const body = { messages: [{ role: "tool", content: input }] };
    const stats = compressMessages(body, "safe");
    // read-numbered is in UNSAFE_FILTER_NAMES — safe mode must skip it
    expect(stats?.hits).toHaveLength(0);
    expect(body.messages[0].content).toBe(input);
  });

  it("skips smart-truncate in safe mode (passes content through unchanged)", () => {
    const input = Array.from({ length: 400 }, (_, i) => `line ${i}`).join("\n");
    const body = { messages: [{ role: "tool", content: input }] };
    const stats = compressMessages(body, "safe");
    expect(stats?.hits).toHaveLength(0);
    expect(body.messages[0].content).toBe(input);
  });

  it("still compresses git-diff in safe mode (safe filter, not in skip list)", () => {
    const input = makeLongDiff();
    const body = { messages: [{ role: "tool", content: input }] };
    const stats = compressMessages(body, "safe");
    expect(stats?.hits[0]?.filter).toBe("git-diff");
    expect(body.messages[0].content.length).toBeLessThan(input.length);
  });

  it("still compresses build-output in safe mode", () => {
    const input = makeBuildOutput();
    const body = { messages: [{ role: "tool", content: input }] };
    const stats = compressMessages(body, "safe");
    expect(stats?.hits[0]?.filter).toBe("build-output");
  });

  it("still compresses grep in safe mode but with raised per-file cap", () => {
    // 40 matches in one file — exceeds full cap (10) but under safe cap (50)
    const input = makeGrepOutput();
    const body = { messages: [{ role: "tool", content: input }] };
    const stats = compressMessages(body, "safe");
    expect(stats?.hits[0]?.filter).toBe("grep");
    const content = body.messages[0].content as string;
    // In safe mode, all 40 matches in foo.js should be shown (no "+N more" hint for foo.js)
    expect(content).not.toContain("+30 more matches not shown");
    // bar.js has 10 matches — under both caps, no truncation hint expected
    expect(content).not.toContain("+0 more matches");
  });

  it("still compresses find in safe mode but with raised caps", () => {
    // 30 files in src/a — exceeds full per-dir cap (10) but under safe (50)
    const input = makeFindOutput();
    const body = { messages: [{ role: "tool", content: input }] };
    const stats = compressMessages(body, "safe");
    expect(stats?.hits[0]?.filter).toBe("find");
    const content = body.messages[0].content as string;
    expect(content).not.toContain("+20 more files not shown");
  });
});

describe("RTK actionable hint format", () => {
  it("git-diff hint no longer references the rtk CLI binary", () => {
    const input = makeLongDiff(2, 200);
    const body = { messages: [{ role: "tool", content: input }] };
    compressMessages(body, "full");
    const content = body.messages[0].content as string;
    expect(content).toContain("[diff truncated — re-read individual files for full hunks]");
    expect(content).not.toContain("rtk git diff --no-compact");
    expect(content).not.toContain("--no-compact");
  });

  it("read-numbered hint includes approximate omitted line range", () => {
    const input = makeReadNumbered();
    const out = readNumbered(input);
    expect(out).toContain("re-read with offset/limit");
    expect(out).toMatch(/approx\. lines \d+–\d+/);
    expect(out).not.toContain("(file continues)");
  });

  it("smart-truncate hint includes omit range and re-read guidance", () => {
    const input = Array.from({ length: 400 }, (_, i) => `line ${i}`).join("\n");
    const out = smartTruncate(input);
    expect(out).toContain("re-read this section with a narrower line range");
    expect(out).toMatch(/lines ~\d+–\d+/);
    expect(out).not.toContain("lines truncated\n");
  });

  it("grep hint guides the model to narrow the search", () => {
    // Build input with >50 matches in one file to exceed even the safe cap
    const lines = Array.from({ length: 60 }, (_, i) => `src/foo.js:${i + 1}:const x = ${i};`);
    const input = lines.join("\n");
    const ctx: RtkFilterContext = { profile: "full" };
    const out = grep(input, ctx);
    expect(out).toContain("more matches not shown — narrow the search pattern");
  });

  it("find hint guides the model to search a subdirectory", () => {
    const lines = Array.from({ length: 60 }, (_, i) => `./src/a/${i}.js`);
    const input = lines.join("\n");
    const ctx: RtkFilterContext = { profile: "full" };
    const out = find(input, ctx);
    expect(out).toContain("more files not shown — search within a specific subdirectory");
  });

  it("search-list hint guides the model to narrow scope", () => {
    // Build >20 dirs to exceed full cap
    const paths = [];
    for (let d = 0; d < 30; d++) {
      for (let f = 0; f < 3; f++) paths.push(`- src/dir${d}/file${f}.js`);
    }
    const input = `Result of search in '/x' (total 90 files):\n${paths.join("\n")}`;
    const ctx: RtkFilterContext = { profile: "full" };
    const out = searchList(input, ctx);
    expect(out).toContain("more directories not shown — narrow the search scope");
  });
});

describe("RTK backward-compat boolean shim", () => {
  it("treats boolean true as 'full'", () => {
    const body = { messages: [{ role: "tool", content: makeLongDiff() }] };
    const statsBool = compressMessages(body, true);
    const body2 = { messages: [{ role: "tool", content: makeLongDiff() }] };
    const statsStr = compressMessages(body2, "full");
    expect(statsBool?.hits.length).toBe(statsStr?.hits.length);
  });

  it("treats boolean false as 'off' (returns null)", () => {
    const body = { messages: [{ role: "tool", content: makeLongDiff() }] };
    expect(compressMessages(body, false)).toBeNull();
  });
});
