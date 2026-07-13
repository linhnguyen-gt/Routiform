import test from "node:test";
import assert from "node:assert/strict";

import { buildKiroPayload } from "../../open-sse/translator/request/openai-to-kiro.ts";
import { KiroExecutor } from "../../open-sse/executors/kiro.ts";
import {
  isValidModel,
  findModelName,
  normalizeModelId,
} from "../../open-sse/config/providerModels.ts";

// ── 3.1 — system prompt reaches Kiro EXACTLY ONCE, via the <instructions> content prefix ──
//
// The system prompt is embedded in message content via <instructions> tags only — it is
// deliberately NOT also set on a userInputMessage.systemInstruction field for the
// OpenAI->Kiro path. Sending both was a
// self-inflicted quota tax against Kiro's metered subscription (system prompts can be
// 10-20k tokens). These tests guard against the double-send regression.

test("buildKiroPayload does not send a systemInstruction field (single channel only)", () => {
  const body = {
    messages: [
      { role: "system", content: "You are a careful senior engineer." },
      { role: "user", content: "Hello" },
    ],
  };

  const payload = buildKiroPayload("claude-sonnet-4.5", body, true, null);
  const userInputMessage = payload.conversationState.currentMessage.userInputMessage;

  assert.equal("systemInstruction" in userInputMessage, false);
});

test("buildKiroPayload prefixes current-message content with <instructions>", () => {
  const body = {
    messages: [
      { role: "system", content: "Follow repository rules" },
      { role: "user", content: "Hello" },
    ],
  };

  const payload = buildKiroPayload("claude-sonnet-4.5", body, true, null);
  const content = payload.conversationState.currentMessage.userInputMessage.content;

  assert.equal(
    content.startsWith("<instructions>\nFollow repository rules\n</instructions>\n\n"),
    true
  );
  assert.equal(content.endsWith("Hello"), true);
});

test("buildKiroPayload merges multiple system messages into a single <instructions> prefix", () => {
  const body = {
    messages: [
      { role: "system", content: "Persona: senior engineer" },
      { role: "system", content: "Tool rule: always confirm before deleting files" },
      { role: "user", content: "Hi" },
    ],
  };

  const payload = buildKiroPayload("claude-sonnet-4.5", body, true, null);
  const userInputMessage = payload.conversationState.currentMessage.userInputMessage;

  assert.equal("systemInstruction" in userInputMessage, false);
  assert.equal(userInputMessage.content.includes("Persona: senior engineer"), true);
  assert.equal(
    userInputMessage.content.includes("Tool rule: always confirm before deleting files"),
    true
  );
});

test("buildKiroPayload omits the <instructions> prefix when no system message is present", () => {
  const body = { messages: [{ role: "user", content: "Hello" }] };

  const payload = buildKiroPayload("claude-sonnet-4.5", body, true, null);
  const userInputMessage = payload.conversationState.currentMessage.userInputMessage;

  assert.equal("systemInstruction" in userInputMessage, false);
  assert.equal(userInputMessage.content, "Hello");
});

test("H4: the Kiro request body contains the system prompt text EXACTLY ONCE", () => {
  // A large, distinctive system prompt (simulating a Claude Code / Cline persona+tool-rules
  // block) — if it were sent twice (native field + content prefix), it would appear twice
  // in the serialized body and double the token/quota cost on every request.
  const systemText =
    "UNIQUE_SYSTEM_MARKER_7f3a: You are Claude Code, Anthropic's official CLI for Claude. " +
    "Follow the user's instructions precisely. Use tools when appropriate. " +
    "Never fabricate file contents. Always verify before deleting.";

  const body = {
    messages: [
      { role: "system", content: systemText },
      { role: "user", content: "List the files in this repo." },
    ],
  };

  const payload = buildKiroPayload("claude-sonnet-4.5", body, true, null);
  const serialized = JSON.stringify(payload);

  const occurrences = serialized.split(systemText).length - 1;
  assert.equal(occurrences, 1);
});

// ── 3.2 — <thinking> tags are stripped from assistantResponseEvent content ──

function streamFromChunks(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
}

function encodeKiroHeader(name, value) {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(name);
  const valueBytes = encoder.encode(value);
  const header = new Uint8Array(1 + nameBytes.length + 1 + 2 + valueBytes.length);
  let offset = 0;
  header[offset++] = nameBytes.length;
  header.set(nameBytes, offset);
  offset += nameBytes.length;
  header[offset++] = 7;
  header[offset++] = (valueBytes.length >> 8) & 0xff;
  header[offset++] = valueBytes.length & 0xff;
  header.set(valueBytes, offset);
  return header;
}

const TEST_CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  TEST_CRC32_TABLE[i] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = TEST_CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeKiroFrame(eventType, payload) {
  const encoder = new TextEncoder();
  const headers = encodeKiroHeader(":event-type", eventType);
  const payloadBytes = encoder.encode(JSON.stringify(payload));
  const totalLength = 12 + headers.length + payloadBytes.length + 4;
  const frame = new Uint8Array(totalLength);
  const view = new DataView(frame.buffer);
  view.setUint32(0, totalLength, false);
  view.setUint32(4, headers.length, false);
  view.setUint32(8, crc32(frame.slice(0, 8)), false);
  frame.set(headers, 12);
  frame.set(payloadBytes, 12 + headers.length);
  view.setUint32(totalLength - 4, crc32(frame.slice(0, totalLength - 4)), false);
  return frame;
}

async function collectContentDeltas(rawSSE) {
  const deltas = [];
  for (const line of rawSSE.split("\n")) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    const parsed = JSON.parse(line.slice("data: ".length));
    const content = parsed.choices?.[0]?.delta?.content;
    if (typeof content === "string") deltas.push(content);
  }
  return deltas;
}

test("KiroExecutor strips <thinking>...</thinking> from assistantResponseEvent content", async () => {
  const executor = new KiroExecutor();
  const response = new Response(
    streamFromChunks([
      encodeKiroFrame("assistantResponseEvent", {
        content: "<thinking>internal reasoning</thinking>Hello there",
      }),
      encodeKiroFrame("messageStopEvent", {}),
    ]),
    { headers: { "content-type": "application/vnd.amazon.eventstream" } }
  );

  const transformed = executor.transformEventStreamToSSE(response, "kiro-model");
  const rawSSE = await transformed.text();
  const deltas = await collectContentDeltas(rawSSE);

  assert.equal(deltas.join(""), "Hello there");
  assert.equal(rawSSE.includes("<thinking>"), false);
  assert.equal(rawSSE.includes("internal reasoning"), false);
});

test("KiroExecutor strips a <thinking> tag split across two assistantResponseEvent frames", async () => {
  const executor = new KiroExecutor();
  const response = new Response(
    streamFromChunks([
      encodeKiroFrame("assistantResponseEvent", { content: "Visible <thin" }),
      encodeKiroFrame("assistantResponseEvent", {
        content: "king>hidden reasoning</thin",
      }),
      encodeKiroFrame("assistantResponseEvent", { content: "king> tail text" }),
      encodeKiroFrame("messageStopEvent", {}),
    ]),
    { headers: { "content-type": "application/vnd.amazon.eventstream" } }
  );

  const transformed = executor.transformEventStreamToSSE(response, "kiro-model");
  const rawSSE = await transformed.text();
  const deltas = await collectContentDeltas(rawSSE);

  assert.equal(deltas.join(""), "Visible  tail text");
  assert.equal(rawSSE.includes("hidden reasoning"), false);
  assert.equal(rawSSE.includes("<thin"), false);
});

test("KiroExecutor flushes a held-back partial-tag-looking suffix as plain text when the stream ends", async () => {
  const executor = new KiroExecutor();
  const response = new Response(
    streamFromChunks([
      encodeKiroFrame("assistantResponseEvent", { content: "Ends with less-than <thi" }),
      encodeKiroFrame("messageStopEvent", {}),
    ]),
    { headers: { "content-type": "application/vnd.amazon.eventstream" } }
  );

  const transformed = executor.transformEventStreamToSSE(response, "kiro-model");
  const rawSSE = await transformed.text();
  const deltas = await collectContentDeltas(rawSSE);

  assert.equal(deltas.join(""), "Ends with less-than <thi");
});

test("M2: an unterminated <thinking> tag does not swallow the rest of the response", async () => {
  const executor = new KiroExecutor();
  const response = new Response(
    streamFromChunks([
      encodeKiroFrame("assistantResponseEvent", {
        content:
          "Before the tag. <thinking>this reasoning span never closes and keeps going forever",
      }),
      encodeKiroFrame("messageStopEvent", {}),
    ]),
    { headers: { "content-type": "application/vnd.amazon.eventstream" } }
  );

  const transformed = executor.transformEventStreamToSSE(response, "kiro-model");
  const rawSSE = await transformed.text();
  const deltas = await collectContentDeltas(rawSSE);
  const full = deltas.join("");

  // The content trapped inside the never-closed span must reach the client rather than
  // being silently dropped by flush().
  assert.equal(full.includes("Before the tag."), true);
  assert.equal(full.includes("this reasoning span never closes and keeps going forever"), true);
  assert.equal(rawSSE.includes("data: [DONE]"), true);
});

test("M2: an unterminated <thinking> split across chunks with no close still delivers its content", async () => {
  const executor = new KiroExecutor();
  const response = new Response(
    streamFromChunks([
      encodeKiroFrame("assistantResponseEvent", { content: "Part one. <thinking>orphaned " }),
      encodeKiroFrame("assistantResponseEvent", { content: "reasoning across two frames" }),
      encodeKiroFrame("messageStopEvent", {}),
    ]),
    { headers: { "content-type": "application/vnd.amazon.eventstream" } }
  );

  const transformed = executor.transformEventStreamToSSE(response, "kiro-model");
  const rawSSE = await transformed.text();
  const deltas = await collectContentDeltas(rawSSE);
  const full = deltas.join("");

  assert.equal(full.includes("Part one."), true);
  assert.equal(full.includes("orphaned reasoning across two frames"), true);
});

test("M2: <thinking> inside a fenced code block is not treated as a tag (content preserved verbatim)", async () => {
  const executor = new KiroExecutor();
  const codeSample =
    "Here is the tag format:\n```\n<thinking>example reasoning</thinking>\n```\nDone.";
  const response = new Response(
    streamFromChunks([
      encodeKiroFrame("assistantResponseEvent", { content: codeSample }),
      encodeKiroFrame("messageStopEvent", {}),
    ]),
    { headers: { "content-type": "application/vnd.amazon.eventstream" } }
  );

  const transformed = executor.transformEventStreamToSSE(response, "kiro-model");
  const rawSSE = await transformed.text();
  const deltas = await collectContentDeltas(rawSSE);
  const full = deltas.join("");

  // Not stripped: the literal tag text inside the fence survives untouched.
  assert.equal(full, codeSample);
  assert.equal(full.includes("<thinking>example reasoning</thinking>"), true);
});

// ── 3.3 — Kiro model catalog + dash/dot version id tolerance (scoped to kiro only) ──

test("claude-sonnet-5 and claude-opus-4.8 are routable on Kiro", () => {
  assert.equal(isValidModel("kr", "claude-sonnet-5"), true);
  assert.equal(isValidModel("kr", "claude-opus-4.8"), true);
});

test("normalizeModelId turns digit-hyphen-digit into digit-dot-digit, preserving word suffixes", () => {
  assert.equal(normalizeModelId("claude-sonnet-4-5"), "claude-sonnet-4.5");
  assert.equal(normalizeModelId("claude-sonnet-4-5-thinking"), "claude-sonnet-4.5-thinking");
  assert.equal(normalizeModelId("qwen3-coder-next"), "qwen3-coder-next");
});

test("dash-form model id resolves against Kiro's dot-form registry entry (by alias or provider id)", () => {
  assert.equal(isValidModel("kr", "claude-sonnet-4-5"), true);
  assert.equal(isValidModel("kiro", "claude-sonnet-4-5"), true);
  assert.equal(findModelName("kr", "claude-sonnet-4-5"), "Claude Sonnet 4.5 (1.30x credits)");
});

test("dash-form normalization does NOT leak into other providers with dot-form ids (github 'gh')", () => {
  // github ("gh") also has a bare "claude-sonnet-4.5" entry — dash tolerance must stay kiro-only.
  assert.equal(isValidModel("gh", "claude-sonnet-4.5"), true);
  assert.equal(isValidModel("gh", "claude-sonnet-4-5"), false);
});

// ── 3.4 — CodeWhisperer host is built from the connection's stored region ──

test("KiroExecutor.buildUrl defaults to the us-east-1 CodeWhisperer host with no stored region", () => {
  const executor = new KiroExecutor();
  const url = executor.buildUrl("kiro-model", true, 0, {});
  assert.equal(url, "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse");
});

test("KiroExecutor.buildUrl uses the connection's stored region", () => {
  const executor = new KiroExecutor();
  const url = executor.buildUrl("kiro-model", true, 0, {
    providerSpecificData: { region: "eu-west-1" },
  });
  assert.equal(url, "https://codewhisperer.eu-west-1.amazonaws.com/generateAssistantResponse");
});

test("KiroExecutor.buildUrl ignores a malformed region and falls back to us-east-1", () => {
  const executor = new KiroExecutor();
  const url = executor.buildUrl("kiro-model", true, 0, {
    providerSpecificData: { region: "not-a-region; DROP TABLE" },
  });
  assert.equal(url, "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse");
});
