import test from "node:test";
import assert from "node:assert/strict";

// Command handlers report API failures with `return printError(...)`, which left the exit code at
// 0 — a script or CI step could not tell a failed call from a successful one.

const { printError, printSuccess } = await import("../../bin/cli/output.mjs");

function withCapturedStderr(fn) {
  const original = console.error;
  const lines = [];
  console.error = (msg) => lines.push(String(msg));
  try {
    fn();
  } finally {
    console.error = original;
  }
  return lines;
}

test("printError marks the process as failed", () => {
  const previous = process.exitCode;
  try {
    process.exitCode = 0;
    withCapturedStderr(() => printError("upstream returned 500"));
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previous;
  }
});

test("printError writes to stderr, not stdout", () => {
  const previous = process.exitCode;
  try {
    const lines = withCapturedStderr(() => printError("boom"));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /boom/);
  } finally {
    process.exitCode = previous;
  }
});

test("printSuccess leaves the exit code alone", () => {
  const previous = process.exitCode;
  const originalLog = console.log;
  try {
    process.exitCode = 0;
    console.log = () => {};
    printSuccess("done");
    assert.equal(process.exitCode, 0);
  } finally {
    console.log = originalLog;
    process.exitCode = previous;
  }
});
