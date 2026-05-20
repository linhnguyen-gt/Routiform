import test from "node:test";
import assert from "node:assert/strict";

import { findDevinBin } from "../../open-sse/executors/devin.ts";

test("findDevinBin skips missing container mount and falls back to later executable paths", () => {
  const bin = findDevinBin(
    {
      HOME: "/root",
    },
    (path) => path === "/usr/local/bin/devin"
  );

  assert.equal(bin, "/usr/local/bin/devin");
});

test("findDevinBin prefers DEVIN_BIN when it is executable", () => {
  const bin = findDevinBin(
    {
      HOME: "/root",
      DEVIN_BIN: "/custom/devin",
    },
    (path) => path === "/custom/devin"
  );

  assert.equal(bin, "/custom/devin");
});

test("findDevinBin falls back to PATH lookup when no absolute candidate exists", () => {
  const bin = findDevinBin(
    {
      HOME: "/root",
    },
    () => false
  );

  assert.equal(bin, "devin");
});
