/**
 * Collect an Antigravity SSE stream into a single non-streaming JSON response.
 *
 * The executor always calls the streaming endpoint upstream, so non-streaming
 * clients (probes, dashboard test, chatCore's non-streaming path) need the SSE
 * chunks assembled into one OpenAI-format `chat.completion` payload.
 *
 * @module executors/antigravity/stream-collector
 */
import crypto from "crypto";
import { normalizePlaceholderOnlyAssistantText } from "../../utils/assistantContent.ts";
import {
  createCollectedStream,
  flushAntigravitySSEText,
  processAntigravitySSEText,
  type AntigravityCollectedStream,
} from "./sse-stream.ts";
import type { AntigravityLog, ExecutorResult } from "./types.ts";

// 25s — short enough that test routes (20-30s outer timeout) get a 504
// synthesized BEFORE the outer abort fires, with a structured error body.
// Was 120s, which made a genuinely slow upstream cascade into
// "[502]: This job timed out after 120000 ms" (from Bottleneck) and bury
// the actual reason. Real chat traffic uses streaming and never hits this
// path; only non-streaming clients (probes, dashboard test) collect SSE.
const SSE_COLLECT_TIMEOUT_MS = 25_000;

/** Drain the reader into `collected`. Returns true when the read timed out. */
async function drainSSEBody(
  response: Response,
  collected: AntigravityCollectedStream,
  log?: AntigravityLog,
  signal?: AbortSignal | null
): Promise<boolean> {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const partialLine = { value: "" };
  let timedOut = false;
  const timeout = AbortSignal.timeout(SSE_COLLECT_TIMEOUT_MS);

  try {
    while (true) {
      if (signal?.aborted) throw new Error("Request aborted during SSE collection");
      const { done, value } = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) =>
          timeout.addEventListener("abort", () => reject(new Error("SSE collection timed out")), {
            once: true,
          })
        ),
      ]);
      if (done) break;
      processAntigravitySSEText(
        decoder.decode(value, { stream: true }),
        partialLine,
        collected,
        log
      );
    }
  } catch (err) {
    const msg = (err as Error | undefined)?.message || String(err);
    timedOut = msg.includes("timed out");
    log?.warn?.("SSE_COLLECT", `Error collecting SSE stream: ${msg}`);
    // Fall through — return whatever was collected so far
  }

  processAntigravitySSEText(decoder.decode(), partialLine, collected, log);
  flushAntigravitySSEText(partialLine, collected, log);
  return timedOut;
}

/** Build the synthetic OpenAI-format `chat.completion` payload. */
function buildChatCompletion(
  collected: AntigravityCollectedStream,
  model: string,
  timedOut: boolean
): Record<string, unknown> {
  return {
    id: `chatcmpl-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: normalizePlaceholderOnlyAssistantText(collected.textContent),
        },
        finish_reason: timedOut ? "length" : collected.finishReason,
      },
    ],
    ...(collected.usage && { usage: collected.usage }),
    // Expose credit balance for upstream consumers (usage service, dashboard)
    ...(collected.remainingCredits && { _remainingCredits: collected.remainingCredits }),
  };
}

/**
 * Parse Gemini-format SSE chunks and assemble text content + usage into one
 * OpenAI-format chat.completion response. A read timeout yields a 504 with
 * whatever was collected so far.
 */
export async function collectAntigravityStream(
  response: Response,
  model: string,
  url: string,
  headers: Record<string, string>,
  transformedBody: Record<string, unknown>,
  log?: AntigravityLog,
  signal?: AbortSignal | null
): Promise<ExecutorResult> {
  const collected = createCollectedStream();
  const timedOut = await drainSSEBody(response, collected, log, signal);

  const result = buildChatCompletion(collected, model, timedOut);
  const syntheticResponse = new Response(JSON.stringify(result), {
    status: timedOut ? 504 : response.status,
    statusText: timedOut ? "Gateway Timeout" : response.statusText,
    headers: [["Content-Type", "application/json"]],
  });

  return { response: syntheticResponse, url, headers, transformedBody };
}
