/**
 * Gemini-format SSE parsing for the Antigravity upstream.
 *
 * Accumulates text, finish reason, usage and credit balance out of the
 * `data:` lines emitted by `v1internal:streamGenerateContent?alt=sse`.
 *
 * @module executors/antigravity/sse-stream
 */
import type { AntigravityLog } from "./types.ts";

const SSE_DATA_PREFIX = "data:";

export type AntigravityCollectedStream = {
  textContent: string;
  finishReason: string;
  usage: Record<string, unknown> | null;
  remainingCredits: Array<{ creditType: string; creditAmount: string }> | null;
};

export function createCollectedStream(): AntigravityCollectedStream {
  return {
    textContent: "",
    finishReason: "stop",
    usage: null,
    remainingCredits: null,
  };
}

type SSEPayload = {
  response?: {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: unknown; thought?: unknown; thoughtSignature?: unknown }>;
      };
      finishReason?: string;
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };
  remainingCredits?: Array<{ creditType: string; creditAmount: string }>;
};

/** Merge one `data:` payload into the accumulator. Malformed JSON is skipped. */
export function processAntigravitySSEPayload(
  payload: string,
  collected: AntigravityCollectedStream,
  log?: AntigravityLog
): void {
  if (!payload || payload === "[DONE]") return;
  try {
    const parsed = JSON.parse(payload) as SSEPayload;
    const candidate = parsed?.response?.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (typeof part.text === "string" && !part.thought && !part.thoughtSignature) {
          collected.textContent += part.text;
        }
      }
    }
    if (candidate?.finishReason) {
      collected.finishReason =
        candidate.finishReason.toLowerCase() === "stop"
          ? "stop"
          : candidate.finishReason.toLowerCase();
    }
    if (parsed?.response?.usageMetadata) {
      const um = parsed.response.usageMetadata;
      collected.usage = {
        prompt_tokens: um.promptTokenCount || 0,
        completion_tokens: um.candidatesTokenCount || 0,
        total_tokens: um.totalTokenCount || 0,
      };
    }
    if (Array.isArray(parsed?.remainingCredits)) {
      collected.remainingCredits = parsed.remainingCredits;
    }
  } catch {
    log?.debug?.("SSE_PARSE", `Skipping malformed SSE line: ${payload.slice(0, 80)}`);
  }
}

/** Feed a decoded chunk; keeps the trailing partial line buffered for the next call. */
export function processAntigravitySSEText(
  text: string,
  partialLine: { value: string },
  collected: AntigravityCollectedStream,
  log?: AntigravityLog
): void {
  partialLine.value += text;
  const lines = partialLine.value.split("\n");
  partialLine.value = lines.pop() || "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(SSE_DATA_PREFIX)) continue;
    processAntigravitySSEPayload(trimmed.slice(SSE_DATA_PREFIX.length).trim(), collected, log);
  }
}

/** Consume a trailing line that never received its newline terminator. */
export function flushAntigravitySSEText(
  partialLine: { value: string },
  collected: AntigravityCollectedStream,
  log?: AntigravityLog
): void {
  const trimmed = partialLine.value.trim();
  partialLine.value = "";
  if (!trimmed.startsWith(SSE_DATA_PREFIX)) return;
  processAntigravitySSEPayload(trimmed.slice(SSE_DATA_PREFIX.length).trim(), collected, log);
}
