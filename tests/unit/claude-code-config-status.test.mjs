import test from "node:test";
import assert from "node:assert/strict";

import {
  buildClaudeCliDefaultModelMap,
  filterLatestClaudeModelRows,
  getClaudeCliConfigStatus,
  isClaudeCode1mEnabled,
  setClaudeCode1mSuffix,
  stripClaudeCode1mSuffix,
} from "@/shared/services/claudeCodeConfig";

test("isClaudeCode1mEnabled detects [1m] from Claude default models", () => {
  assert.equal(
    isClaudeCode1mEnabled({
      ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-20250514[1m]",
    }),
    true
  );
  assert.equal(
    isClaudeCode1mEnabled({
      ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4-7[1m]",
    }),
    true
  );
});

test("getClaudeCliConfigStatus returns configured_1m for local Routiform Claude config", () => {
  assert.equal(
    getClaudeCliConfigStatus({
      ANTHROPIC_BASE_URL: "http://localhost:20128/v1",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-20250514[1m]",
    }),
    "configured_1m"
  );
});

test("getClaudeCliConfigStatus returns configured for local Routiform config without 1m", () => {
  assert.equal(
    getClaudeCliConfigStatus({
      ANTHROPIC_BASE_URL: "http://127.0.0.1:20128/v1",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-20250514",
    }),
    "configured"
  );
});

test("getClaudeCliConfigStatus returns other for non-Routiform endpoints", () => {
  assert.equal(
    getClaudeCliConfigStatus({
      ANTHROPIC_BASE_URL: "https://api.anthropic.com/v1",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-20250514[1m]",
    }),
    "other"
  );
});

test("setClaudeCode1mSuffix appends and strips the 1m suffix cleanly", () => {
  assert.equal(
    setClaudeCode1mSuffix("cc/claude-sonnet-4-20250514", true),
    "cc/claude-sonnet-4-20250514[1m]"
  );
  assert.equal(
    setClaudeCode1mSuffix("cc/claude-sonnet-4-20250514[1m]", false),
    "cc/claude-sonnet-4-20250514"
  );
});

test("setClaudeCode1mSuffix falls back to the provided default model", () => {
  assert.equal(setClaudeCode1mSuffix("", true, "cc/sonnet"), "cc/sonnet[1m]");
  assert.equal(stripClaudeCode1mSuffix("cc/sonnet[1m]"), "cc/sonnet");
});

test("filterLatestClaudeModelRows keeps only the newest Claude family model", () => {
  const rows = filterLatestClaudeModelRows([
    { id: "claude-opus-4-6" },
    { id: "claude-opus-4-7" },
    { id: "claude-sonnet-4-5-20250929" },
    { id: "claude-sonnet-4-6" },
    { id: "claude-haiku-4-5-20251001" },
  ]);

  assert.deepEqual(
    rows.map((row) => row.id).sort(),
    ["claude-haiku-4-5-20251001", "claude-opus-4-7", "claude-sonnet-4-6"].sort()
  );
});

test("buildClaudeCliDefaultModelMap prefixes newest provider models with the Claude alias", () => {
  assert.deepEqual(
    buildClaudeCliDefaultModelMap([
      { id: "claude-opus-4-6" },
      { id: "claude-opus-4-7" },
      { id: "claude-sonnet-4-6" },
      { id: "claude-haiku-4-5-20251001" },
    ]),
    {
      opus: "cc/claude-opus-4-7",
      sonnet: "cc/claude-sonnet-4-6",
      haiku: "cc/claude-haiku-4-5-20251001",
    }
  );
});
