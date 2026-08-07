import test from "node:test";
import assert from "node:assert/strict";

import { uniqueComboName } from "../../src/app/(dashboard)/dashboard/combos/components/combo-utils.ts";

test("an unused base name is returned unchanged", () => {
  assert.strictEqual(uniqueComboName("free-stack", []), "free-stack");
  assert.strictEqual(uniqueComboName("free-stack", ["other"]), "free-stack");
});

test("a taken base name gets the first free numeric suffix", () => {
  assert.strictEqual(uniqueComboName("free-stack", ["free-stack"]), "free-stack-2");
  assert.strictEqual(uniqueComboName("free-stack", ["free-stack", "free-stack-2"]), "free-stack-3");
});

test("gaps in the suffix sequence are filled, not skipped", () => {
  assert.strictEqual(uniqueComboName("free-stack", ["free-stack", "free-stack-3"]), "free-stack-2");
});

test("matching is case-insensitive and whitespace-tolerant", () => {
  assert.strictEqual(uniqueComboName("free-stack", ["  FREE-Stack "]), "free-stack-2");
});

test("empty and nullish taken entries are ignored", () => {
  assert.strictEqual(uniqueComboName("free-stack", ["", "   ", null, undefined]), "free-stack");
});

test("any iterable of taken names is accepted", () => {
  assert.strictEqual(uniqueComboName("free-stack", new Set(["free-stack"])), "free-stack-2");
});

test("the suffix search is bounded and falls back to the base", () => {
  const taken = ["free-stack", ...Array.from({ length: 998 }, (_, i) => `free-stack-${i + 2}`)];
  assert.strictEqual(uniqueComboName("free-stack", taken), "free-stack");
});
