import { describe, expect, it } from "vitest";

import { autoDetectFilter } from "../autodetect.ts";
import { compressMessages, formatRtkLog } from "../index.ts";
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
  const stats = compressMessages(body, true);
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
    expect(out).toContain("lines truncated");
    expect(out.length).toBeLessThan(input.length);
  });
});

describe("compressMessages shapes", () => {
  it("compresses OpenAI tool string content", () => {
    const body = { messages: [{ role: "tool", content: makeLongDiff() }] };
    const before = String(body.messages[0].content);
    const stats = compressMessages(body, true);
    expect(stats?.hits[0]).toMatchObject({ shape: "openai-tool", filter: "git-diff" });
    expect(body.messages[0].content.length).toBeLessThan(before.length);
  });

  it("compresses OpenAI tool array text content", () => {
    const body = {
      messages: [{ role: "tool", content: [{ type: "text", text: makeGrepOutput() }] }],
    };
    const stats = compressMessages(body, true);
    expect(stats?.hits[0]).toMatchObject({ shape: "openai-tool-array", filter: "grep" });
  });

  it("compresses Claude tool_result string content", () => {
    const body = {
      messages: [{ role: "user", content: [{ type: "tool_result", content: makeFindOutput() }] }],
    };
    const stats = compressMessages(body, true);
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
    const stats = compressMessages(body, true);
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
    const stats = compressMessages(body, true);
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
    const stats = compressMessages(body, true);
    expect(stats?.hits.map((hit) => hit.shape)).toEqual(["kiro-tool-result", "kiro-tool-result"]);
    expect(stats?.hits.map((hit) => hit.filter).sort()).toEqual(["build-output", "git-diff"]);
  });
});

describe("RTK safety gates", () => {
  it("returns null and leaves the body unchanged when disabled", () => {
    const diff = makeLongDiff();
    const body = { messages: [{ role: "tool", content: diff }] };
    expect(compressMessages(body, false)).toBeNull();
    expect(body.messages[0].content).toBe(diff);
  });

  it("leaves tiny blobs untouched", () => {
    const body = { messages: [{ role: "tool", content: "diff --git a/x b/x\n@@ -1 +1 @@\n+a" }] };
    const before = body.messages[0].content;
    const stats = compressMessages(body, true);
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
    const claudeStats = compressMessages({ messages: body.messages }, true);
    const kiroStats = compressMessages({ conversationState: body.conversationState }, true);
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
    const stats = compressMessages(body, true);
    expect(stats?.hits).toHaveLength(0);
    expect(body.messages[0].content).toBe(input);
  });

  it("formats RTK log lines", () => {
    const body = { messages: [{ role: "tool", content: makeLongDiff() }] };
    const line = formatRtkLog(compressMessages(body, true));
    expect(line).toMatch(/^\[RTK\] saved \d+B \/ \d+B \([\d.]+%\) via \[git-diff\] hits=1$/);
  });
});
