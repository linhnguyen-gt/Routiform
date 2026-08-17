import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { clearIdempotency, saveIdempotency } from "../../src/lib/idempotencyLayer.ts";
import {
  captureIdempotentResponse,
  readIdempotencyKey,
  serveIdempotentResponse,
} from "../../src/sse/handlers/chat-idempotency.ts";

const jsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

describe("chat ingress idempotency", () => {
  beforeEach(() => {
    clearIdempotency();
  });

  describe("readIdempotencyKey", () => {
    it("prefers Idempotency-Key, falls back to X-Request-Id", () => {
      assert.equal(readIdempotencyKey({ "x-request-id": "req-1" }), "req-1");
      assert.equal(
        readIdempotencyKey({ "idempotency-key": "idem-1", "x-request-id": "req-1" }),
        "idem-1"
      );
      assert.equal(readIdempotencyKey(null), null);
    });
  });

  describe("serveIdempotentResponse", () => {
    it("replays a cached body and flags it", async () => {
      saveIdempotency("key-1", { choices: [{ message: { content: "hi" } }] }, 200);

      const replay = serveIdempotentResponse("key-1", false);
      assert.ok(replay);
      assert.equal(replay.status, 200);
      assert.equal(replay.headers.get("X-Routiform-Idempotent"), "true");
      assert.deepEqual(await replay.json(), { choices: [{ message: { content: "hi" } }] });
    });

    it("returns null without a key or a cache entry", () => {
      assert.equal(serveIdempotentResponse(null, false), null);
      assert.equal(serveIdempotentResponse("missing", false), null);
    });

    it("never serves a JSON body to a streaming caller", () => {
      saveIdempotency("key-2", { choices: [] }, 200);
      assert.equal(serveIdempotentResponse("key-2", true), null);
    });
  });

  describe("captureIdempotentResponse", () => {
    it("caches the successful non-streaming response", async () => {
      const response = jsonResponse({ id: "a" });
      await captureIdempotentResponse("key-3", response, false);

      const replay = serveIdempotentResponse("key-3", false);
      assert.deepEqual(await replay.json(), { id: "a" });
      // The original must stay readable — capture works off a clone.
      assert.deepEqual(await response.json(), { id: "a" });
    });

    it("does not cache failures, streams, or replays", async () => {
      await captureIdempotentResponse(
        "k-err",
        jsonResponse({ error: "boom" }, { status: 502 }),
        false
      );
      await captureIdempotentResponse("k-stream", jsonResponse({ id: "b" }), true);
      await captureIdempotentResponse(
        "k-replay",
        jsonResponse({ id: "c" }, { headers: { "X-Routiform-Idempotent": "true" } }),
        false
      );

      assert.equal(serveIdempotentResponse("k-err", false), null);
      assert.equal(serveIdempotentResponse("k-stream", false), null);
      assert.equal(serveIdempotentResponse("k-replay", false), null);
    });

    it("ignores a non-JSON body", async () => {
      const response = new Response("data: hello\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
      await captureIdempotentResponse("k-sse", response, false);
      assert.equal(serveIdempotentResponse("k-sse", false), null);
    });
  });

  // Regression guard for the defect this module exists to fix: idempotency
  // evaluated per upstream attempt made combo fallback replay the first model's
  // rejected body instead of calling the next provider. The per-attempt pipeline
  // must therefore never touch the idempotency store again.
  describe("chat-core stays free of idempotency", () => {
    const walk = (dir) =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return entry === "__tests__" ? [] : walk(full);
        return full.endsWith(".ts") ? [full] : [];
      });

    it("no per-attempt module imports the idempotency layer", () => {
      const offenders = [
        ...walk("open-sse/handlers/chat-core"),
        ...walk("open-sse/handlers/phases"),
      ].filter((file) => /idempotencyLayer/.test(readFileSync(file, "utf8")));

      assert.deepEqual(offenders, []);
    });
  });
});
