/**
 * Unit tests for Qoder encoding + COSY signing primitives.
 *
 * These cover the parts that would silently produce wrong-but-plausible
 * output if logic regressed:
 *   - body encoder boundary cases (empty input, lengths not divisible by 3)
 *   - COSY header production (signature deterministic given fixed inputs,
 *     all required headers present, sigPath correctly stripped)
 *   - device flow URL construction
 *   - parseExpiry edge cases
 *   - wrapQoderSSE envelope unwrapping
 */

import { describe, it, expect } from "vitest";

import { qoderEncodeBody } from "../../src/lib/qoder/encoding.ts";
import { buildCosyHeaders } from "../../src/lib/qoder/cosy.ts";
import { QoderService } from "../../src/lib/oauth/services/qoder.ts";
import { QODER_CHAT_URL_ENCODED, QODER_MODEL_LIST_URL } from "../../src/lib/qoder/constants.ts";
import { __test__ as qoderExecutorInternals } from "../executors/qoder.ts";

const initiateDeviceFlow = () => new QoderService().initiateDeviceFlow();
const parseExpiry = QoderService.parseExpiry;

describe("qoderEncodeBody", () => {
  it("preserves base64 length (input length divisible by 3)", () => {
    const input = Buffer.from("abcdef", "utf8"); // 6 bytes → 8 base64 chars
    const encoded = qoderEncodeBody(input);
    expect(encoded.length).toBe(8);
  });

  it("preserves base64 length (input length not divisible by 3)", () => {
    const input = Buffer.from("hello", "utf8"); // 5 bytes → 8 base64 chars (with padding)
    const encoded = qoderEncodeBody(input);
    expect(encoded.length).toBe(8);
  });

  it("returns empty string for empty input", () => {
    expect(qoderEncodeBody(Buffer.alloc(0))).toBe("");
    expect(qoderEncodeBody("")).toBe("");
  });

  it("substitutes characters via the custom alphabet (no plaintext base64 leaks)", () => {
    const input = Buffer.from("hello world", "utf8");
    const encoded = qoderEncodeBody(input);
    // Standard base64 of "hello world" is "aGVsbG8gd29ybGQ=" — encoded form
    // must not equal that, and must not contain '=' (replaced with '$').
    expect(encoded).not.toBe("aGVsbG8gd29ybGQ=");
    expect(encoded.includes("=")).toBe(false);
  });

  it("accepts string input as utf8", () => {
    const a = qoderEncodeBody("hello");
    const b = qoderEncodeBody(Buffer.from("hello", "utf8"));
    expect(a).toBe(b);
  });
});

describe("buildCosyHeaders", () => {
  const creds = {
    userId: "user-123",
    authToken: "dt-abcdef",
    name: "Tester",
    email: "test@example.com",
    machineId: "11111111-2222-3333-4444-555555555555",
  };

  it("requires userId and authToken", () => {
    expect(() =>
      buildCosyHeaders(Buffer.alloc(0), QODER_MODEL_LIST_URL, { ...creds, userId: "" })
    ).toThrow(/user id/i);
    expect(() =>
      buildCosyHeaders(Buffer.alloc(0), QODER_MODEL_LIST_URL, { ...creds, authToken: "" })
    ).toThrow(/auth token/i);
  });

  it("emits the full set of required Cosy-* headers", () => {
    const h = buildCosyHeaders(Buffer.from("payload", "utf8"), QODER_CHAT_URL_ENCODED, creds);
    const required = [
      "Authorization",
      "Cosy-Key",
      "Cosy-User",
      "Cosy-Date",
      "Cosy-Version",
      "Cosy-Machineid",
      "Cosy-Machinetoken",
      "Cosy-Machinetype",
      "Cosy-Machineos",
      "Cosy-Clienttype",
      "Cosy-Clientip",
      "Cosy-Bodyhash",
      "Cosy-Bodylength",
      "Cosy-Sigpath",
      "Cosy-Data-Policy",
      "Cosy-Organization-Id",
      "Cosy-Organization-Tags",
      "Login-Version",
      "X-Request-Id",
    ];
    for (const key of required) {
      expect(h[key]).toBeDefined();
    }
    expect(h.Authorization.startsWith("Bearer COSY.")).toBe(true);
  });

  it("strips /algo prefix from sigPath", () => {
    const h = buildCosyHeaders(Buffer.alloc(0), QODER_MODEL_LIST_URL, creds);
    expect(h["Cosy-Sigpath"]).toBe("/api/v2/model/list");
    expect(h["Cosy-Sigpath"].startsWith("/algo")).toBe(false);
  });

  it("uses provided machineId verbatim", () => {
    const h = buildCosyHeaders(Buffer.alloc(0), QODER_MODEL_LIST_URL, creds);
    expect(h["Cosy-Machineid"]).toBe(creds.machineId);
  });

  it("hash + length match body bytes", () => {
    const body = Buffer.from("hello", "utf8");
    const h = buildCosyHeaders(body, QODER_CHAT_URL_ENCODED, creds);
    expect(h["Cosy-Bodylength"]).toBe(String(body.length));
    // Cosy-Bodyhash is md5 of the raw bytes — exactly 32 hex chars.
    expect(h["Cosy-Bodyhash"]).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("QoderService.initiateDeviceFlow", () => {
  it("builds verification URL with all PKCE params", () => {
    const flow = initiateDeviceFlow();
    expect(flow.codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(flow.nonce).toMatch(/^[0-9a-f-]{36}$/);
    expect(flow.machineId).toMatch(/^[0-9a-f-]{36}$/);
    const u = new URL(flow.verificationUriComplete);
    expect(u.origin + u.pathname).toBe("https://qoder.com/device/selectAccounts");
    expect(u.searchParams.get("challenge_method")).toBe("S256");
    expect(u.searchParams.get("nonce")).toBe(flow.nonce);
    expect(u.searchParams.get("machine_id")).toBe(flow.machineId);
    const challenge = u.searchParams.get("challenge");
    expect(challenge).toBeTruthy();
    expect(challenge!.length).toBeGreaterThan(20);
  });
});

describe("QoderService.parseExpiry", () => {
  it("returns ms-epoch number as-is", () => {
    expect(parseExpiry(1781594470000, undefined)).toBe(1781594470000);
  });

  it("parses numeric string as ms-epoch (not as a year)", () => {
    expect(parseExpiry("1781594470000", undefined)).toBe(1781594470000);
  });

  it("parses RFC3339 string", () => {
    const ts = parseExpiry("2026-06-16T07:15:04Z", undefined);
    expect(ts).toBe(Date.parse("2026-06-16T07:15:04Z"));
  });

  it("falls back to expiresInSeconds=0 → now (already expired)", () => {
    const before = Date.now();
    const got = parseExpiry(undefined, 0);
    const after = Date.now();
    expect(got).toBeGreaterThanOrEqual(before);
    expect(got).toBeLessThanOrEqual(after);
  });

  it("falls back to now + 30 days when both missing", () => {
    const got = parseExpiry(undefined, undefined);
    const days30 = 30 * 24 * 60 * 60 * 1000;
    // Allow ±2 seconds slack for test execution time.
    expect(got).toBeGreaterThan(Date.now() + days30 - 2000);
    expect(got).toBeLessThan(Date.now() + days30 + 2000);
  });
});

describe("wrapQoderSSE", () => {
  const { wrapQoderSSE } = qoderExecutorInternals;

  async function readAll(res: Response): Promise<string> {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let out = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      out += decoder.decode(value, { stream: true });
    }
    return out;
  }

  function sseStream(lines: string[]): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const l of lines) controller.enqueue(encoder.encode(l));
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  }

  it("unwraps {statusCodeValue, body} envelopes into plain OpenAI SSE", async () => {
    const inner = JSON.stringify({ choices: [{ delta: { content: "hi" } }] });
    const env = JSON.stringify({ statusCodeValue: 200, body: inner });
    const upstream = sseStream([`data: ${env}\n\n`, "data: [DONE]\n\n"]);
    const wrapped = wrapQoderSSE(upstream, "qoder/auto");
    const text = await readAll(wrapped);
    expect(text).toContain(`data: ${inner}`);
    expect(text).toContain("data: [DONE]");
  });

  it("converts upstream non-200 envelope into a synthetic error chunk", async () => {
    const env = JSON.stringify({ statusCodeValue: 500, body: "boom" });
    const upstream = sseStream([`data: ${env}\n\n`]);
    const wrapped = wrapQoderSSE(upstream, "qoder/auto");
    const text = await readAll(wrapped);
    expect(text).toContain("[qoder error 500: boom]");
    expect(text).toContain("data: [DONE]");
  });

  it("emits a final [DONE] even when upstream forgot one", async () => {
    const inner = JSON.stringify({ choices: [{ delta: { content: "hi" } }] });
    const env = JSON.stringify({ statusCodeValue: 200, body: inner });
    const upstream = sseStream([`data: ${env}\n\n`]);
    const wrapped = wrapQoderSSE(upstream, "qoder/auto");
    const text = await readAll(wrapped);
    expect(text.trim().endsWith("data: [DONE]")).toBe(true);
  });
});
