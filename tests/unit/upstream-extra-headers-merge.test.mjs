import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeUpstreamExtraHeaders } from "../../open-sse/executors/base.ts";

test("mergeUpstreamExtraHeaders: empty Authorization does not wipe executor Bearer", () => {
  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer sk-or-real",
  };
  mergeUpstreamExtraHeaders(headers, {
    Authorization: "",
    "x-custom": "ok",
  });
  assert.strictEqual(headers.Authorization, "Bearer sk-or-real");
  assert.strictEqual(headers["x-custom"], "ok");
});

test("mergeUpstreamExtraHeaders: non-empty Authorization still overrides", () => {
  const headers = { Authorization: "Bearer a" };
  mergeUpstreamExtraHeaders(headers, { Authorization: "Bearer b" });
  assert.strictEqual(headers.Authorization, "Bearer b");
});
