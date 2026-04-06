import test from "node:test";
import assert from "node:assert/strict";

import { getClineAccessToken, buildClineHeaders } from "../../open-sse/services/clineAuth.ts";

test("getClineAccessToken adds workos: prefix for Cline API", () => {
  assert.equal(getClineAccessToken("abc.def.ghi"), "workos:abc.def.ghi");
  assert.equal(getClineAccessToken("workos:already"), "workos:already");
  assert.equal(getClineAccessToken(""), "");
});

test("buildClineHeaders sets Bearer workos: and client headers", () => {
  const h = buildClineHeaders("tok", true);
  assert.equal(h.Authorization, "Bearer workos:tok");
  assert.equal(h.Accept, "text/event-stream");
  assert.equal(h["HTTP-Referer"], "https://cline.bot");
  assert.equal(h["X-CLIENT-TYPE"], "omniroute");
});
