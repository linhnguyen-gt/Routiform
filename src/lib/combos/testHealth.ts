import { parseSSEToOpenAIResponse } from "@routiform/open-sse/handlers/sseParser.ts";
import { unwrapOpenAIChatCompletionRoot } from "@routiform/open-sse/utils/chatCompletionEnvelope.ts";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function joinNonEmpty(parts: string[]) {
  return parts.filter(Boolean).join("\n").trim();
}

/**
 * Extract user-visible assistant text from OpenAI `message.content` (string, array of parts, or single object).
 * Gemini/Cline often use `content: [{ type: "text", content: "..." }]` (text vs content) or `parts[]` on the message.
 */
function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content.trim();

  if (content && typeof content === "object" && !Array.isArray(content)) {
    const o = asRecord(content);
    if (typeof o.text === "string" && o.text.trim()) return o.text.trim();
    if (typeof o.content === "string" && o.content.trim()) return o.content.trim();
  }

  if (!Array.isArray(content)) return "";

  const pieces: string[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      if (part.trim()) pieces.push(part.trim());
      continue;
    }
    const block = asRecord(part);
    const blockType = typeof block.type === "string" ? block.type : "";
    const fromText = typeof block.text === "string" ? block.text.trim() : "";
    const fromContent = typeof block.content === "string" ? block.content.trim() : "";
    const chunk = fromText || fromContent;
    if (!chunk) continue;
    if (
      !blockType ||
      blockType === "text" ||
      blockType === "output_text" ||
      blockType === "text_delta"
    ) {
      pieces.push(chunk);
    }
  }
  return pieces.join("\n").trim();
}

function extractGeminiStyleMessageParts(message: JsonRecord): string {
  const parts = message.parts;
  if (!Array.isArray(parts)) return "";
  const out: string[] = [];
  for (const p of parts) {
    const pr = asRecord(p);
    if (typeof pr.text === "string" && pr.text.trim()) out.push(pr.text.trim());
    else if (typeof pr.content === "string" && pr.content.trim()) out.push(pr.content.trim());
  }
  return out.join("\n").trim();
}

/** Gemini / Cline reasoning models: `content` may be only `[{ type: "reasoning", text: "..." }]`. */
function extractReasoningFromContentArray(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const out: string[] = [];
  for (const part of content) {
    const block = asRecord(part);
    const blockType = typeof block.type === "string" ? block.type.toLowerCase() : "";
    if (
      !blockType ||
      blockType.includes("reason") ||
      blockType.includes("think") ||
      blockType === "model_thought" ||
      blockType === "thought"
    ) {
      const t =
        (typeof block.text === "string" && block.text.trim()) ||
        (typeof block.content === "string" && block.content.trim()) ||
        (typeof block.reasoning === "string" && block.reasoning.trim()) ||
        "";
      if (t) out.push(t);
    }
  }
  return out.join("\n").trim();
}

/** Google GenAI REST shape: `candidates[0].content.parts` (no `choices`). */
function extractGeminiCandidatesText(body: JsonRecord): string {
  const candidates = body.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  const c0 = asRecord(candidates[0]);
  const content = asRecord(c0.content);
  const parts = content.parts;
  if (!Array.isArray(parts)) return "";
  const out: string[] = [];
  for (const p of parts) {
    const pr = asRecord(p);
    if (typeof pr.text === "string" && pr.text.trim()) out.push(pr.text.trim());
    else if (typeof pr.content === "string" && pr.content.trim()) out.push(pr.content.trim());
  }
  return out.join("\n").trim();
}

/** Best-effort assistant visible text from one chat.completion choice. */
function extractAssistantVisibleText(choiceRecord: JsonRecord): string {
  const message = asRecord(choiceRecord.message);
  if (typeof message.refusal === "string" && message.refusal.trim()) {
    return message.refusal.trim();
  }
  let t = extractTextFromContent(message.content);
  if (t) return t;
  t = extractGeminiStyleMessageParts(message);
  if (t) return t;

  const delta = asRecord(choiceRecord.delta);
  if (Object.keys(delta).length > 0) {
    t = extractTextFromContent(delta.content);
    if (t) return t;
  }

  if (typeof choiceRecord.text === "string" && choiceRecord.text.trim()) {
    return choiceRecord.text.trim();
  }
  return "";
}

function extractReasoningText(record: JsonRecord): string {
  const fromContentArray = extractReasoningFromContentArray(record.content);
  const reasoningDetails = Array.isArray(record.reasoning_details) ? record.reasoning_details : [];
  const detailText = reasoningDetails
    .map((detail) => {
      const detailRecord = asRecord(detail);
      const detailType = typeof detailRecord.type === "string" ? detailRecord.type : "";
      const text =
        typeof detailRecord.text === "string"
          ? detailRecord.text.trim()
          : typeof detailRecord.content === "string"
            ? detailRecord.content.trim()
            : "";

      if (
        text &&
        (detailType === "" ||
          detailType === "reasoning" ||
          detailType === "reasoning.text" ||
          detailType === "thinking")
      ) {
        return text;
      }

      return "";
    })
    .filter(Boolean);

  return joinNonEmpty([
    typeof record.reasoning_content === "string" ? record.reasoning_content.trim() : "",
    typeof record.reasoning === "string" ? record.reasoning.trim() : "",
    typeof record.reasoning_text === "string" ? record.reasoning_text.trim() : "",
    typeof record.thinking === "string" ? record.thinking.trim() : "",
    fromContentArray,
    joinNonEmpty(detailText),
  ]);
}

function getUsageReasoningTokens(body: JsonRecord): number {
  const usage = asRecord(body.usage);
  if (!usage) return 0;

  const completionDetails = asRecord(usage.completion_tokens_details);
  const topLevelReasoning =
    typeof usage.reasoning_tokens === "number" && Number.isFinite(usage.reasoning_tokens)
      ? usage.reasoning_tokens
      : 0;
  const detailedReasoning =
    typeof completionDetails.reasoning_tokens === "number" &&
    Number.isFinite(completionDetails.reasoning_tokens)
      ? completionDetails.reasoning_tokens
      : 0;

  return Math.max(topLevelReasoning, detailedReasoning);
}

function hasReasoningOnlyCompletion(body: JsonRecord): boolean {
  if (!Array.isArray(body.choices) || body.choices.length === 0) return false;
  if (getUsageReasoningTokens(body) <= 0) return false;

  return body.choices.some((choice) => {
    const choiceRecord = asRecord(choice);
    const message = asRecord(choiceRecord.message);
    const finishReason =
      typeof choiceRecord.finish_reason === "string" ? choiceRecord.finish_reason : "";

    if (!message || message.role !== "assistant") return false;
    if (!finishReason) return false;
    if (extractAssistantVisibleText(choiceRecord)) return false;
    if (extractReasoningText(message)) return false;
    return true;
  });
}

function hasTokenOnlyAssistantCompletion(body: JsonRecord): boolean {
  if (!Array.isArray(body.choices) || body.choices.length === 0) return false;
  const usage = asRecord(body.usage);
  const completionTokens =
    typeof usage.completion_tokens === "number" && Number.isFinite(usage.completion_tokens)
      ? usage.completion_tokens
      : 0;
  if (completionTokens <= 0) return false;

  return body.choices.some((choice) => {
    const choiceRecord = asRecord(choice);
    const message = asRecord(choiceRecord.message);
    if (message.role !== "assistant") return false;
    if (extractAssistantVisibleText(choiceRecord)) return false;
    if (extractReasoningText(message)) return false;
    const finishReason =
      typeof choiceRecord.finish_reason === "string" ? choiceRecord.finish_reason : "";
    return finishReason === "stop" || finishReason === "length";
  });
}

function isCodexLikeModel(modelHint: string): boolean {
  const normalized = modelHint.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.startsWith("cx/") ||
    normalized.startsWith("codex/") ||
    normalized.includes("/codex") ||
    normalized.includes("-codex")
  );
}

/**
 * Normalize OpenAI-style / proxy error JSON into a single string for combo test UI.
 */
export function extractComboTestUpstreamError(errBody: unknown, fallback: string): string {
  if (errBody == null || typeof errBody !== "object") return fallback;
  const o = errBody as Record<string, unknown>;
  const err = o.error;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object") {
    const eo = err as Record<string, unknown>;
    const msg = typeof eo.message === "string" ? eo.message.trim() : "";
    const code = typeof eo.code === "string" ? eo.code.trim() : "";
    if (msg && code) return `${code}: ${msg}`;
    if (msg) return msg;
  }
  if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
  return fallback;
}

function toNumericStatus(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}

/**
 * Detect provider-style status/code errors even when a proxy returns HTTP 200.
 * Some gateways wrap failures as `{ status: 402, msg: "..." }` or nested equivalents.
 */
export function extractComboTestProviderStatusError(responseBody: unknown): string {
  const queue: unknown[] = [responseBody];
  const seen = new Set<unknown>();
  let visited = 0;

  while (queue.length > 0 && visited < 256) {
    const node = queue.shift();
    visited += 1;
    if (!node || typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) queue.push(item);
      continue;
    }

    const record = node as JsonRecord;
    const candidates = [record.status, record.statusCode, record.code];

    for (const candidate of candidates) {
      const numericStatus = toNumericStatus(candidate);
      if (numericStatus === null || numericStatus < 400) continue;

      const detail = extractComboTestUpstreamError(record, "");
      if (detail) {
        const detailNormalized = detail.toLowerCase();
        if (detailNormalized.includes(`status ${numericStatus}`)) {
          return detail;
        }
        return `Provider status ${numericStatus}: ${detail}`;
      }
      return `Provider status ${numericStatus}`;
    }

    for (const value of Object.values(record)) {
      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  return "";
}

export function buildComboTestRequestBody(modelStr: string) {
  return {
    model: modelStr,
    messages: [{ role: "user", content: "Reply with OK only." }],
    // Reasoning models (Gemini 2.5, Gemini 3 *-agent, DeepSeek-R1, etc.) burn
    // budget on internal thinking first. 256 was too small for Gemini 3
    // *-agent tiers (which reserve ~234 thought tokens just to plan a
    // one-word answer) — the budget ran out mid-thinking and the upstream
    // never produced visible content, surfacing as a probe timeout. 1024
    // leaves ~800 tokens after the typical thought reserve.
    max_tokens: 1024,
    // Stream the probe end-to-end. Routiform's antigravity executor ALWAYS
    // hits the upstream streaming endpoint regardless of this flag, but
    // `stream: true` keeps the SSE pipe open through chatCore — so partial
    // chunks reach the test route before the upstream fully completes,
    // letting probes succeed at first-token-time instead of last-token-time.
    stream: true,
  };
}

/** Gateways / proxies may nest the completion under `result`, `response`, or double-encode JSON. */
function collectCompletionRoots(responseBody: unknown): JsonRecord[] {
  if (Array.isArray(responseBody) && responseBody.length > 0) {
    const first = responseBody[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      return collectCompletionRoots(first);
    }
  }

  const r = asRecord(responseBody);
  const seen = new Set<string>();
  const out: JsonRecord[] = [];

  const push = (rec: JsonRecord) => {
    const u = unwrapOpenAIChatCompletionRoot(rec);
    try {
      const sig = JSON.stringify(u);
      if (seen.has(sig)) return;
      seen.add(sig);
    } catch {
      out.push(u);
      return;
    }
    out.push(u);
  };

  push(r);
  for (const key of ["result", "response"] as const) {
    const v = r[key];
    if (v && typeof v === "object" && !Array.isArray(v)) push(asRecord(v));
  }
  const data = r.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const d = asRecord(data);
    for (const key of ["result", "response"] as const) {
      const v = d[key];
      if (v && typeof v === "object" && !Array.isArray(v)) push(asRecord(v));
    }
  }

  return out;
}

function extractComboTestResponseTextFromUnwrappedBody(body: JsonRecord, modelHint = ""): string {
  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return body.output_text.trim();
  }

  const candidatesText = extractGeminiCandidatesText(body);
  if (candidatesText) return candidatesText;

  if (Array.isArray(body.choices)) {
    for (const choice of body.choices) {
      const choiceRecord = asRecord(choice);
      const message = asRecord(choiceRecord.message);
      const messageText = extractAssistantVisibleText(choiceRecord);
      if (messageText) return messageText;

      const reasoningText = extractReasoningText(message);
      if (reasoningText) return reasoningText;
    }
  }

  if (Array.isArray(body.output)) {
    for (const item of body.output) {
      const itemRecord = asRecord(item);
      const contentText = extractTextFromContent(itemRecord.content);
      if (contentText) return contentText;

      const reasoningText = extractReasoningText(itemRecord);
      if (reasoningText) return reasoningText;
    }
  }

  const topLevelText = extractTextFromContent(body.content);
  if (topLevelText) return topLevelText;

  const topLevelReasoning = extractReasoningText(body);
  if (topLevelReasoning) return topLevelReasoning;

  if (hasReasoningOnlyCompletion(body)) {
    return "[reasoning-only completion]";
  }

  if (isCodexLikeModel(modelHint) && hasTokenOnlyAssistantCompletion(body)) {
    return "[token-only completion]";
  }

  return "";
}

export function extractComboTestResponseText(responseBody: unknown, modelHint = ""): string {
  for (const body of collectCompletionRoots(responseBody)) {
    const t = extractComboTestResponseTextFromUnwrappedBody(body, modelHint);
    if (t) return t;
  }
  return "";
}

/**
 * Some gateways wrap upstream failures into assistant text while still returning HTTP 200.
 * For smoke tests (`Reply with OK only.`), error-shaped content must be treated as failure.
 */
export function isComboTestErrorLikeText(text: string): boolean {
  const normalized = String(text || "")
    .trim()
    .toLowerCase();
  if (!normalized) return false;

  const patterns = [
    /^\[\s*\d{3}\s*]\s*:/,
    /^error\s*\[\s*\d{3}\s*]\s*:/,
    /^error\b/,
    /\bpayment required\b/,
    /\bpaid model\b/,
    /\badd credits?\b/,
    /\byou\s+have\s+reached\s+(?:the\s+)?limit\b/,
    /\blimit\s+reached\b/,
    /\binsufficient\s+(quota|credit|credits|balance)\b/,
    /\bquota\s+exceeded\b/,
    /\brate\s*limit(?:ed|ing)?\b/,
    /\binvalid\s+api\s+key\b/,
    /\bunauthorized\b/,
    /\bforbidden\b/,
  ];

  return patterns.some((pattern) => pattern.test(normalized));
}

/** Parse JSON; unwrap one or more JSON-in-string layers (some proxies double-encode). */
function jsonParseLenient(trimmed: string): unknown | undefined {
  try {
    let v: unknown = JSON.parse(trimmed);
    for (let i = 0; i < 4; i++) {
      if (typeof v !== "string") break;
      const s = v.trim();
      if (!s) break;
      if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
        try {
          v = JSON.parse(s);
          continue;
        } catch {
          break;
        }
      }
      break;
    }
    return v;
  } catch {
    return undefined;
  }
}

/**
 * Parse raw HTTP body from `/v1/chat/completions` for combo health checks.
 * Cline (and some proxies) may return JSON with a top-level `data` envelope, or SSE
 * even when `stream: false` — `res.json()` then fails or yields nothing useful.
 */
export function parseComboTestHttpPayload(
  rawText: string,
  modelHint: string,
  contentType?: string
): unknown {
  const trimmed = String(rawText || "").trim();
  if (!trimmed) return null;

  const parsedJson = jsonParseLenient(trimmed);

  if (parsedJson !== undefined && extractComboTestResponseText(parsedJson)) {
    return parsedJson;
  }

  const ct = (contentType || "").toLowerCase();
  const looksLikeSse = ct.includes("text/event-stream") || /(^|\n)\s*data:/m.test(trimmed);

  if (looksLikeSse || parsedJson === undefined) {
    const fromSse = parseSSEToOpenAIResponse(trimmed, modelHint);
    if (fromSse && extractComboTestResponseText(fromSse)) {
      return fromSse;
    }
  }

  // JSON parsed to an object we don't recognize, but body may contain SSE lines (rare hybrids).
  if (parsedJson !== undefined && /(^|\n)\s*data:/m.test(trimmed)) {
    const fromSse = parseSSEToOpenAIResponse(trimmed, modelHint);
    if (fromSse && extractComboTestResponseText(fromSse)) {
      return fromSse;
    }
  }

  return parsedJson !== undefined ? parsedJson : null;
}
