import { translateResponse, initState } from "../../translator/index.ts";
import { FORMATS } from "../../translator/formats.ts";
import { trackPendingRequest } from "@/lib/usageDb";
import {
  extractUsage,
  hasValidUsage,
  estimateUsage,
  estimateOutputTokens,
  estimateInputTokens,
  logUsage,
  addBufferToUsage,
  filterUsageForFormat,
} from "../usageTracking.ts";
import { generateSessionId } from "../../services/sessionManager.ts";
import {
  buildPromptUsageSeed,
  rememberPromptUsage,
  shouldRememberPromptUsage,
} from "../../services/promptUsageMemory.ts";
import {
  parseSSELine,
  hasValuableContent,
  fixInvalidId,
  formatSSE,
  unwrapGeminiChunk,
} from "../streamHelpers.ts";
import {
  createStructuredSSECollector,
  buildStreamSummaryFromEvents,
} from "../streamPayloadCollector.ts";
import { STREAM_IDLE_TIMEOUT_MS } from "../../config/constants.ts";
import {
  sanitizeStreamingChunk,
  extractThinkingFromContent,
} from "../../handlers/responseSanitizer.ts";
import type {
  JsonRecord,
  StreamOptions,
  ToolCall,
  TranslateState,
  UsageTokenRecord,
} from "./types.ts";
import {
  getOpenAIIntermediateChunks,
  restoreClaudePassthroughToolUseName,
  collapseExactDuplicateAssistantText,
  mergeUsageNonDestructive,
} from "./streamUsageMerge.ts";

// Note: TextDecoder/TextEncoder are created per-stream inside createSSEStream()
// to avoid shared state issues with concurrent streams (TextDecoder with {stream:true}
// maintains internal buffering state between decode() calls).

/**
 * Stream modes
 */
export const STREAM_MODE = {
  TRANSLATE: "translate", // Full translation between formats
  PASSTHROUGH: "passthrough", // No translation, normalize output, extract usage
};

/**
 * Cap on unterminated SSE data held between chunks. A provider that stops
 * sending newlines would otherwise grow `buffer` without bound.
 */
const MAX_LINE_BUFFER_CHARS = 1_000_000;

/** Minimum interval between malformed-provider-line warnings (cost control). */
const MALFORMED_LINE_LOG_INTERVAL_MS = 5_000;
let lastMalformedLineLogAt = 0;
/**
 * Create unified SSE transform stream with idle timeout protection.
 * If the upstream provider stops sending data for longer than the effective idle limit
 * (`idleTimeoutMs` option, else `STREAM_IDLE_TIMEOUT_MS`), the stream errors with
 * `StreamIdleTimeoutError` and logs `HTTP_STATUS.GATEWAY_TIMEOUT` (504-class) for combo fallback.
 *
 * @param {object} options
 * @param {string} options.mode - Stream mode: translate, passthrough
 * @param {string} options.targetFormat - Provider format (for translate mode)
 * @param {string} options.sourceFormat - Client format (for translate mode)
 * @param {string} options.provider - Provider name
 * @param {object} options.reqLogger - Request logger instance
 * @param {string} options.model - Model name
 * @param {string} options.connectionId - Connection ID for usage tracking
 * @param {object|null} options.apiKeyInfo - API key metadata for usage attribution
 * @param {object} options.body - Request body (for input token estimation)
 * @param {function} options.onComplete - Callback when stream finishes: ({ status, usage }) => void
 * @param {number} [options.idleTimeoutMs] - Per-stream idle limit (ms); overrides global env default.
 */
export function createSSEStream(options: StreamOptions = {}) {
  const {
    mode = STREAM_MODE.TRANSLATE,
    targetFormat,
    sourceFormat,
    provider = null,
    reqLogger = null,
    toolNameMap = null,
    model = null,
    connectionId = null,
    apiKeyInfo = null,
    body = null,
    onComplete = null,
    idleTimeoutMs: idleTimeoutMsOption = null,
  } = options;

  const effectiveIdleMs =
    typeof idleTimeoutMsOption === "number" && Number.isFinite(idleTimeoutMsOption)
      ? Math.max(0, Math.floor(idleTimeoutMsOption))
      : STREAM_IDLE_TIMEOUT_MS;

  const idleCheckIntervalMs =
    effectiveIdleMs <= 0 ? 0 : Math.min(10_000, Math.max(250, Math.floor(effectiveIdleMs / 4)));

  let buffer = "";
  let usage: UsageTokenRecord | null = null;
  /** Passthrough (OpenAI CC shape): saw tool_calls in stream before finish_reason */
  let passthroughHasToolCalls = false;
  /** Passthrough: accumulate tool_calls deltas for call log responseBody */
  const passthroughToolCalls = new Map<string, ToolCall>();
  let passthroughToolCallSeq = 0;

  const sessionKey = generateSessionId(body as { model?: string; messages?: unknown[] });
  const promptUsageKeys = [sessionKey, connectionId, "local"];
  // message_start is what Claude Code paints first. A heuristic seed that is
  // ~70% of DeepSeek's real prompt_tokens makes the meter bounce 26% → 36% on
  // every tool turn. Seed from the conversation id only — connectionId/"local"
  // are account-wide and leak the previous /new session onto message_start.
  const { seed: promptUsageSeed, compact: compactSummarizer } = buildPromptUsageSeed({
    body,
    keys: [sessionKey],
    estimatedTokens: estimateInputTokens(body),
    estimatedFloorTokens: estimateInputTokens(body, { excludeMessages: true }),
  });

  function usageForClient(usage: UsageTokenRecord | Record<string, unknown> | null | undefined) {
    if (!usage || !promptUsageSeed) return usage;
    const rec = usage as Record<string, unknown>;
    const inTokens = Number(rec.input_tokens ?? rec.prompt_tokens ?? 0);
    const cacheRead = Number(rec.cache_read_input_tokens ?? rec.cache_read_tokens ?? 0);
    const cacheCreate = Number(rec.cache_creation_input_tokens ?? rec.cache_creation_tokens ?? 0);
    if (!compactSummarizer && inTokens + cacheRead + cacheCreate > 0) return usage;
    const next = { ...usage } as Record<string, unknown>;
    if (next.input_tokens !== undefined) next.input_tokens = promptUsageSeed.input_tokens;
    if (next.prompt_tokens !== undefined) next.prompt_tokens = promptUsageSeed.input_tokens;
    if (compactSummarizer) {
      delete next.cache_read_input_tokens;
      delete next.cache_creation_input_tokens;
      delete next.cache_read_tokens;
      delete next.cache_creation_tokens;
    }
    return next;
  }

  // State for translate mode (accumulatedContent for call log response body)
  const state: TranslateState | null =
    mode === STREAM_MODE.TRANSLATE
      ? {
          ...(initState(sourceFormat) as TranslateState),
          provider,
          toolNameMap,
          accumulatedContent: "",
          promptUsageSeed,
          forcePromptUsageSeed: compactSummarizer,
        }
      : null;

  // Track content length for usage estimation (both modes)
  let totalContentLength = 0;
  // Passthrough: accumulate content and reasoning separately for call log response body
  let passthroughAccumulatedContent = "";
  let passthroughAccumulatedReasoning = "";
  const wantsFinalUsageChunk =
    (sourceFormat === FORMATS.OPENAI || mode === STREAM_MODE.PASSTHROUGH) &&
    !!body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    (body as JsonRecord).stream_options &&
    typeof (body as JsonRecord).stream_options === "object" &&
    !Array.isArray((body as JsonRecord).stream_options) &&
    ((body as JsonRecord).stream_options as JsonRecord).include_usage === true;
  let finalUsageChunk: JsonRecord | null = null;

  // Guard against duplicate [DONE] events — ensures exactly one per stream
  let doneSent = false;
  const providerPayloadCollector = createStructuredSSECollector({
    stage: "provider_response",
  });
  const clientPayloadCollector = createStructuredSSECollector({
    stage: "client_response",
  });

  // Per-stream instances to avoid shared state with concurrent streams
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  // Idle timeout state — closes stream if provider stops sending data
  let lastChunkTime = Date.now();
  let idleTimer: ReturnType<typeof setInterval> | null = null;
  let streamTimedOut = false;
  /** Set once usage/pending accounting has run (flush or cancel) — never twice. */
  let finalized = false;

  // The literal below carries the web-standard cancel() hook, which the bundled
  // lib.dom Transformer dictionary does not declare yet — hence the assertion.
  return new TransformStream(
    {
      start(controller) {
        // Idle watchdog — interval scales down when idle timeout is short (faster zombie detection).
        if (effectiveIdleMs > 0 && idleCheckIntervalMs > 0) {
          idleTimer = setInterval(() => {
            if (!streamTimedOut && Date.now() - lastChunkTime > effectiveIdleMs) {
              streamTimedOut = true;
              clearInterval(idleTimer);
              idleTimer = null;
              const timeoutMsg = `[STREAM] Idle timeout: no data from ${provider || "provider"} for ${effectiveIdleMs}ms (model: ${model || "unknown"})`;
              console.warn(timeoutMsg);
              trackPendingRequest(model, provider, connectionId, false);
              const timeoutError = new Error(timeoutMsg);
              timeoutError.name = "StreamIdleTimeoutError";
              controller.error(timeoutError);
            }
          }, idleCheckIntervalMs);
        }
      },

      transform(chunk, controller) {
        if (streamTimedOut) return;
        lastChunkTime = Date.now();
        const text = decoder.decode(chunk, { stream: true });
        buffer += text;
        reqLogger?.appendProviderChunk?.(text);

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        // Unterminated-data guard: if the trailing fragment exceeds the cap,
        // force-flush it as a complete line so memory stays bounded and the
        // stream keeps moving instead of buffering forever.
        if (buffer.length > MAX_LINE_BUFFER_CHARS) {
          console.warn(
            `[STREAM] Line buffer exceeded ${MAX_LINE_BUFFER_CHARS} chars without newline (provider: ${provider || "unknown"}, model: ${model || "unknown"}) — force-flushing`
          );
          lines.push(buffer);
          buffer = "";
        }
        for (const line of lines) {
          const trimmed = line.trim();

          // Passthrough mode: normalize and forward
          if (mode === STREAM_MODE.PASSTHROUGH) {
            let output;
            let injectedUsage = false;
            let clientPayload: unknown = null;

            if (trimmed.startsWith("data:")) {
              const providerPayload = parseSSELine(trimmed);
              if (providerPayload) {
                providerPayloadCollector.push(providerPayload);
                if ((providerPayload as { done?: unknown }).done === true) {
                  clientPayloadCollector.push(providerPayload);
                }
              }
            }

            if (trimmed.startsWith("data:") && trimmed.slice(5).trim() === "[DONE]") {
              if (!doneSent) {
                if (wantsFinalUsageChunk && finalUsageChunk?.usage) {
                  const usageOutput = formatSSE(finalUsageChunk, FORMATS.OPENAI);
                  clientPayloadCollector.push(finalUsageChunk);
                  reqLogger?.appendConvertedChunk?.(usageOutput);
                  controller.enqueue(encoder.encode(usageOutput));
                }
                doneSent = true;
                const doneOutput = "data: [DONE]\n\n";
                reqLogger?.appendConvertedChunk?.(doneOutput);
                controller.enqueue(encoder.encode(doneOutput));
              }
              continue;
            }

            if (trimmed.startsWith("data:") && trimmed.slice(5).trim() !== "[DONE]") {
              try {
                let parsed = JSON.parse(trimmed.slice(5).trim());

                // Detect Responses SSE payloads (have a `type` field like "response.created",
                // "response.output_item.added", etc.) and skip Chat Completions-specific
                // sanitization to avoid corrupting the stream for Responses-native clients.
                const isResponsesSSE =
                  parsed.type &&
                  typeof parsed.type === "string" &&
                  parsed.type.startsWith("response.");

                // Detect Claude SSE payloads. Includes "ping" and "error" to ensure
                // they bypass the Chat Completions sanitization path which would
                // incorrectly process or drop them.
                const isClaudeSSE =
                  parsed.type &&
                  typeof parsed.type === "string" &&
                  (parsed.type.startsWith("message") ||
                    parsed.type.startsWith("content_block") ||
                    parsed.type === "ping" ||
                    parsed.type === "error");

                if (isResponsesSSE) {
                  // Responses SSE: only extract usage, forward payload as-is.
                  // Non-destructive merge (see mergeUsageNonDestructive): a later
                  // response.completed/response.done retry event must never zero
                  // out prompt/cache tokens captured from an earlier one.
                  const extracted = extractUsage(parsed);
                  usage = mergeUsageNonDestructive(usage, extracted);
                  // Track content length for fallback usage estimates.
                  // Only visible text deltas become assistant content in logs/replay.
                  if (typeof parsed.delta === "string") {
                    totalContentLength += parsed.delta.length;
                  }
                  if (
                    parsed.type === "response.output_text.delta" &&
                    typeof parsed.delta === "string"
                  ) {
                    passthroughAccumulatedContent += parsed.delta;
                  }
                } else if (isClaudeSSE) {
                  // Claude SSE: extract usage, track content, forward as-is.
                  // Non-destructive merge (see mergeUsageNonDestructive): message_start
                  // carries input_tokens, message_delta carries output_tokens only — never
                  // overwrite a positive value with 0.
                  const extracted = extractUsage(parsed);
                  usage = mergeUsageNonDestructive(usage, extracted);
                  const restoredToolName = restoreClaudePassthroughToolUseName(parsed, toolNameMap);
                  // Track content length and accumulate from Claude format
                  if (parsed.delta?.text) {
                    totalContentLength += parsed.delta.text.length;
                    passthroughAccumulatedContent += parsed.delta.text;
                  }
                  if (parsed.delta?.thinking) {
                    totalContentLength += parsed.delta.thinking.length;
                    passthroughAccumulatedContent += parsed.delta.thinking;
                  }
                  if (restoredToolName) {
                    output = `data: ${JSON.stringify(parsed)}
`;
                    injectedUsage = true;
                  }
                } else {
                  // Chat Completions: full sanitization pipeline

                  // Detect reasoning alias before sanitization strips it
                  const hadReasoningAlias = !!(
                    parsed.choices?.[0]?.delta?.reasoning &&
                    typeof parsed.choices[0].delta.reasoning === "string" &&
                    !parsed.choices[0].delta.reasoning_content
                  );

                  parsed = sanitizeStreamingChunk(parsed);

                  const idFixed = fixInvalidId(parsed);

                  // Extract + merge usage BEFORE the hasValuableContent guard.
                  // OpenAI's stream_options.include_usage FINAL frame is exactly
                  // {"choices":[],"usage":{...}} — no choices[0].delta — so
                  // hasValuableContent() below returns false for it and would
                  // `continue` past accounting entirely, silently discarding the
                  // only frame that carries real usage for these providers. The
                  // guard must only decide whether to FORWARD the frame to the
                  // client, never whether to bill it.
                  // Non-destructive merge (see mergeUsageNonDestructive): a later
                  // delta carrying partial/zero usage must never zero out prompt/cache
                  // tokens captured from an earlier delta.
                  const extractedEarly = extractUsage(parsed);
                  usage = mergeUsageNonDestructive(usage, extractedEarly);

                  if (!hasValuableContent(parsed, FORMATS.OPENAI)) {
                    continue;
                  }

                  const delta = parsed.choices?.[0]?.delta;

                  // Extract <think> tags from streaming content
                  if (delta?.content && typeof delta.content === "string") {
                    const { content, thinking } = extractThinkingFromContent(delta.content);
                    delta.content = content;
                    if (thinking && !delta.reasoning_content) {
                      delta.reasoning_content = thinking;
                    }
                  }

                  // Split combined reasoning+content deltas into separate SSE events.
                  // Standard OpenAI streaming never mixes both fields in one delta;
                  // clients (e.g. LobeChat) may skip content when reasoning_content
                  // is present, causing the first content token to be lost.
                  if (delta?.reasoning_content && delta?.content) {
                    const reasoningChunk = JSON.parse(JSON.stringify(parsed));
                    const rDelta = reasoningChunk.choices[0].delta;
                    delete rDelta.content;
                    reasoningChunk.choices[0].finish_reason = null;
                    delete reasoningChunk.usage;
                    const rOutput = `data: ${JSON.stringify(reasoningChunk)}\n`;
                    passthroughAccumulatedReasoning += delta.reasoning_content;
                    totalContentLength += delta.reasoning_content.length;
                    clientPayloadCollector.push(reasoningChunk);
                    reqLogger?.appendConvertedChunk?.(rOutput);
                    controller.enqueue(encoder.encode(rOutput));
                    controller.enqueue(encoder.encode("\n"));
                    delete delta.reasoning_content;
                  }

                  // Track whether we need to re-serialize (separate from injectedUsage
                  // to avoid blocking subsequent finish_reason / usage mutations)
                  const needsReserialization =
                    hadReasoningAlias || (delta?.content === "" && delta?.reasoning_content);

                  // T18: Track if we saw tool calls & accumulate for call log
                  if (delta?.tool_calls && delta.tool_calls.length > 0) {
                    passthroughHasToolCalls = true;
                    for (const tc of delta.tool_calls) {
                      // Key by index first — id only appears on the first delta in OpenAI streaming
                      let key: string;
                      if (Number.isInteger(tc?.index)) {
                        key = `idx:${tc.index}`;
                      } else if (tc?.id) {
                        key = `id:${tc.id}`;
                      } else {
                        key = `seq:${++passthroughToolCallSeq}`;
                      }
                      const existing = passthroughToolCalls.get(key);
                      const deltaArgs =
                        typeof tc?.function?.arguments === "string" ? tc.function.arguments : "";
                      if (!existing) {
                        passthroughToolCalls.set(key, {
                          id: tc?.id ?? null,
                          index: Number.isInteger(tc?.index) ? tc.index : passthroughToolCalls.size,
                          type: tc?.type || "function",
                          function: {
                            name: tc?.function?.name || "",
                            arguments: deltaArgs,
                          },
                        });
                      } else {
                        if (tc?.id) existing.id = existing.id || tc.id;
                        if (tc?.function?.name && !existing.function.name)
                          existing.function.name = tc.function.name;
                        existing.function.arguments += deltaArgs;
                      }
                    }
                  }

                  const content = delta?.content || delta?.reasoning_content;
                  if (content && typeof content === "string") {
                    totalContentLength += content.length;
                  }
                  if (typeof delta?.content === "string")
                    passthroughAccumulatedContent += delta.content;
                  if (typeof delta?.reasoning_content === "string")
                    passthroughAccumulatedReasoning += delta.reasoning_content;

                  // Usage for this frame was already extracted + merged above
                  // (before the hasValuableContent guard) — see comment there.

                  const isFinishChunk = parsed.choices?.[0]?.finish_reason;

                  // T18: Normalize finish_reason to 'tool_calls' if tool calls were used
                  if (
                    isFinishChunk &&
                    passthroughHasToolCalls &&
                    parsed.choices[0].finish_reason !== "tool_calls"
                  ) {
                    parsed.choices[0].finish_reason = "tool_calls";
                    // If we modify it, we must output the modified object
                    if (!injectedUsage && hasValidUsage(parsed.usage)) {
                      output = `data: ${JSON.stringify(parsed)}\n`;
                      injectedUsage = true;
                    }
                  }
                  if (isFinishChunk && !hasValidUsage(parsed.usage)) {
                    const estimated = estimateUsage(body, totalContentLength, FORMATS.OPENAI);
                    usage = estimated;
                    if (wantsFinalUsageChunk) {
                      finalUsageChunk = {
                        id: parsed.id,
                        object: "chat.completion.chunk",
                        created: parsed.created,
                        model: parsed.model,
                        choices: [],
                        usage: filterUsageForFormat(
                          usageForClient(estimated) as UsageTokenRecord,
                          FORMATS.OPENAI
                        ),
                        ...(parsed.system_fingerprint !== undefined
                          ? { system_fingerprint: parsed.system_fingerprint }
                          : {}),
                        ...(parsed.service_tier !== undefined
                          ? { service_tier: parsed.service_tier }
                          : {}),
                      };
                      delete parsed.usage;
                    } else {
                      parsed.usage = filterUsageForFormat(
                        usageForClient(estimated) as UsageTokenRecord,
                        FORMATS.OPENAI
                      );
                    }
                    output = `data: ${JSON.stringify(parsed)}\n`;
                    injectedUsage = true;
                  } else if (isFinishChunk && usage) {
                    const buffered = addBufferToUsage(usage);
                    if (wantsFinalUsageChunk) {
                      finalUsageChunk = {
                        id: parsed.id,
                        object: "chat.completion.chunk",
                        created: parsed.created,
                        model: parsed.model,
                        choices: [],
                        usage: filterUsageForFormat(
                          usageForClient(usage) as UsageTokenRecord,
                          FORMATS.OPENAI
                        ),
                        ...(parsed.system_fingerprint !== undefined
                          ? { system_fingerprint: parsed.system_fingerprint }
                          : {}),
                        ...(parsed.service_tier !== undefined
                          ? { service_tier: parsed.service_tier }
                          : {}),
                      };
                      delete parsed.usage;
                    } else {
                      parsed.usage = filterUsageForFormat(
                        usageForClient(buffered) as UsageTokenRecord,
                        FORMATS.OPENAI
                      );
                    }
                    output = `data: ${JSON.stringify(parsed)}\n`;
                    injectedUsage = true;
                  } else if (idFixed || needsReserialization) {
                    output = `data: ${JSON.stringify(parsed)}\n`;
                    injectedUsage = true;
                  }
                }

                clientPayload = parsed;
              } catch (error) {
                // Malformed provider JSON on one line is expected noise from some
                // upstreams — drop the line, but log it (rate-limited) so silent
                // content loss is visible.
                const now = Date.now();
                if (now - lastMalformedLineLogAt >= MALFORMED_LINE_LOG_INTERVAL_MS) {
                  lastMalformedLineLogAt = now;
                  console.warn(
                    `[STREAM] Malformed provider line dropped (provider: ${provider || "unknown"}, model: ${model || "unknown"}, connectionId: ${connectionId || "n/a"}):`,
                    error instanceof Error ? error.message : error
                  );
                }
              }
            }

            if (!injectedUsage) {
              if (line.startsWith("data:") && !line.startsWith("data: ")) {
                output = "data: " + line.slice(5) + "\n";
              } else {
                output = line + "\n";
              }
            }

            if (clientPayload) {
              clientPayloadCollector.push(clientPayload);
            }

            reqLogger?.appendConvertedChunk?.(output);
            controller.enqueue(encoder.encode(output));
            continue;
          }

          // Translate mode
          if (!trimmed) continue;

          const parsed = parseSSELine(trimmed);
          if (!parsed) continue;
          providerPayloadCollector.push(parsed);

          if (parsed && parsed.done) {
            if (!doneSent) {
              if (wantsFinalUsageChunk && finalUsageChunk?.usage) {
                const usageOutput = formatSSE(finalUsageChunk, FORMATS.OPENAI);
                clientPayloadCollector.push(finalUsageChunk);
                reqLogger?.appendConvertedChunk?.(usageOutput);
                controller.enqueue(encoder.encode(usageOutput));
              }
              doneSent = true;
              clientPayloadCollector.push({ done: true });
              const output = "data: [DONE]\n\n";
              reqLogger?.appendConvertedChunk?.(output);
              controller.enqueue(encoder.encode(output));
            }
            continue;
          }

          // Track content length and accumulate for call log (from raw provider chunk, so content is never missed)
          // Do this before translation so we capture content regardless of translator output shape

          // Claude format
          if (parsed.delta?.text) {
            const t = parsed.delta.text;
            totalContentLength += t.length;
            if (state?.accumulatedContent !== undefined && typeof t === "string")
              state.accumulatedContent += t;
          }
          if (parsed.delta?.thinking) {
            const t = parsed.delta.thinking;
            totalContentLength += t.length;
            if (state?.accumulatedContent !== undefined && typeof t === "string")
              state.accumulatedContent += t;
          }

          // OpenAI format
          if (parsed.choices?.[0]?.delta?.content) {
            const c = parsed.choices[0].delta.content;
            if (typeof c === "string") {
              totalContentLength += c.length;
              if (state?.accumulatedContent !== undefined) state.accumulatedContent += c;
            } else if (Array.isArray(c)) {
              for (const part of c) {
                if (part?.text && typeof part.text === "string") {
                  totalContentLength += part.text.length;
                  if (state?.accumulatedContent !== undefined)
                    state.accumulatedContent += part.text;
                }
              }
            }
          }
          if (parsed.choices?.[0]?.delta?.reasoning_content) {
            const r = parsed.choices[0].delta.reasoning_content;
            if (typeof r === "string") {
              totalContentLength += r.length;
              if (state?.accumulatedContent !== undefined) state.accumulatedContent += r;
            }
          }
          // Normalize `reasoning` alias → `reasoning_content` (NVIDIA kimi-k2.5 etc.)
          if (
            parsed.choices?.[0]?.delta?.reasoning &&
            !parsed.choices?.[0]?.delta?.reasoning_content
          ) {
            const r = parsed.choices[0].delta.reasoning;
            if (typeof r === "string") {
              parsed.choices[0].delta.reasoning_content = r;
              delete parsed.choices[0].delta.reasoning;
              totalContentLength += r.length;
              if (state?.accumulatedContent !== undefined) state.accumulatedContent += r;
            }
          }

          // Gemini / Cloud Code format - may have multiple parts
          // Cloud Code API wraps in { response: { candidates: [...] } }, so unwrap.
          // Only applies to Gemini-family formats — skip for OpenAI, Claude, etc.
          const isGeminiFormat =
            targetFormat === FORMATS.GEMINI || targetFormat === FORMATS.ANTIGRAVITY;
          const geminiChunk = isGeminiFormat ? unwrapGeminiChunk(parsed) : parsed;
          if (geminiChunk.candidates?.[0]?.content?.parts) {
            for (const part of geminiChunk.candidates[0].content.parts) {
              if (part.text && typeof part.text === "string") {
                totalContentLength += part.text.length;
                if (state?.accumulatedContent !== undefined) state.accumulatedContent += part.text;
              }
            }
          }

          // Generic fallback: delta string, top-level content/text (e.g. some SSE payloads)
          if (state?.accumulatedContent !== undefined) {
            if (typeof (parsed as JsonRecord).delta === "string") {
              const d = (parsed as JsonRecord).delta as string;
              state.accumulatedContent += d;
              totalContentLength += d.length;
            }
            if (typeof (parsed as JsonRecord).content === "string") {
              const c = (parsed as JsonRecord).content as string;
              state.accumulatedContent += c;
              totalContentLength += c.length;
            }
            if (typeof (parsed as JsonRecord).text === "string") {
              const t = (parsed as JsonRecord).text as string;
              state.accumulatedContent += t;
              totalContentLength += t.length;
            }
          }

          // Extract usage
          // Non-destructive merge (see mergeUsageNonDestructive): a raw
          // extractUsage() result for a single event (e.g. Claude message_delta
          // carrying only output_tokens) must never blow away prompt/cache tokens
          // already captured in state.usage from an earlier event, or the
          // translator's internal `prevUsage.input_tokens` fallback (see
          // translator/response/claude-to-openai.ts) always resolves to 0.
          const extracted = extractUsage(parsed);
          state.usage = mergeUsageNonDestructive(state.usage as UsageTokenRecord, extracted);

          // Translate: targetFormat -> openai -> sourceFormat
          const translated = translateResponse(targetFormat, sourceFormat, parsed, state);

          // Log OpenAI intermediate chunks (if available)
          for (const item of getOpenAIIntermediateChunks(translated)) {
            const openaiOutput = formatSSE(item, FORMATS.OPENAI);
            reqLogger?.appendOpenAIChunk?.(openaiOutput);
          }

          if (translated?.length > 0) {
            for (const item of translated) {
              // Content for call log is accumulated only from parsed (above) to avoid double-counting;
              // do not add again from item here.

              // #723, #727: Sanitize only when the client-facing stream is OpenAI Chat format.
              // When translating Responses -> Claude, `item` is already a Claude SSE event;
              // sanitizing it as an OpenAI chunk strips message_start/content_block_delta/message_stop
              // and causes Claude Code to drop the assistant message.
              // #761: Responses API events have {event, data} structure — skip sanitization
              // entirely as it strips them to {"object":"chat.completion.chunk"}, losing all content.
              let itemSanitized: Record<string, unknown> = item;
              const isResponsesEvent =
                typeof item?.event === "string" && item.event.startsWith("response.");
              if (sourceFormat === FORMATS.OPENAI && !isResponsesEvent) {
                itemSanitized = sanitizeStreamingChunk(itemSanitized) as Record<string, unknown>;

                // Extract reasoning tags from content if translation generated them.
                // Skip for Kiro: KiroExecutor already strips literal <thinking> tags
                // itself (executors/kiro.ts#stripThinkingTags) with fence-aware, carry-
                // buffer-correct logic before the chunk ever reaches this pipeline.
                // Running this generic, fence-unaware regex again on top would double-
                // strip — and, worse, delete a <thinking> example that Kiro's stripper
                // deliberately preserved because it's inside a fenced code block.
                if (provider !== "kiro") {
                  const delta = itemSanitized?.choices?.[0]?.delta;
                  if (delta?.content && typeof delta.content === "string") {
                    const { content, thinking } = extractThinkingFromContent(delta.content);
                    delta.content = content;
                    if (thinking && !delta.reasoning_content) {
                      delta.reasoning_content = thinking;
                    }
                  }
                }
              }

              // Filter empty chunks
              if (!hasValuableContent(itemSanitized, sourceFormat)) {
                continue; // Skip this empty chunk
              }

              // Inject estimated usage if finish chunk has no valid usage.
              // Gate on state.usage (the accumulator mergeUsageNonDestructive maintains
              // across the whole stream), not itemSanitized.usage: a translator's finish
              // item may legitimately omit `.usage` on the item itself (relying on the
              // buffered-state branch below to attach it) even though real usage was
              // already reported and accumulated in state.usage. Gating on the item's own
              // field let a blind estimate clobber that real data — an ESTIMATE must never
              // overwrite a real reported value, only apply when nothing was ever reported.
              const isFinishChunk =
                itemSanitized.type === "message_delta" || itemSanitized.choices?.[0]?.finish_reason;

              // Per-side completion estimate: hasValidUsage() is an OR across
              // fields, so a real prompt_tokens/input_tokens value alone suppresses
              // estimation for BOTH sides below — billing 0 output tokens for a
              // response that produced real content (e.g. a Claude-compatible
              // gateway whose message_start reports input tokens but whose
              // message_delta never reports output tokens). Patch only the
              // completion side here, in place, before the gate runs, so a
              // genuinely reported prompt side is never touched or re-estimated.
              if (
                state.finishReason &&
                isFinishChunk &&
                state.usage &&
                typeof state.usage === "object" &&
                totalContentLength > 0
              ) {
                const su = state.usage as Record<string, number>;
                const hasCompletionUsage =
                  (typeof su.completion_tokens === "number" && su.completion_tokens > 0) ||
                  (typeof su.output_tokens === "number" && su.output_tokens > 0);
                if (!hasCompletionUsage) {
                  const estimatedOutput = estimateOutputTokens(totalContentLength);
                  const patched: UsageTokenRecord = { ...state.usage };
                  if ("output_tokens" in patched) patched.output_tokens = estimatedOutput;
                  if ("completion_tokens" in patched || !("output_tokens" in patched)) {
                    patched.completion_tokens = estimatedOutput;
                  }
                  const promptSide = (su.prompt_tokens || su.input_tokens || 0) as number;
                  patched.total_tokens = promptSide + estimatedOutput;
                  patched.estimated = true;
                  state.usage = patched;
                }
              }

              if (
                state.finishReason &&
                isFinishChunk &&
                !hasValidUsage(state.usage) &&
                totalContentLength > 0
              ) {
                const estimated = estimateUsage(body, totalContentLength, sourceFormat);
                state.usage = estimated;
                if (wantsFinalUsageChunk) {
                  finalUsageChunk = {
                    id: (itemSanitized as JsonRecord).id,
                    object: "chat.completion.chunk",
                    created: (itemSanitized as JsonRecord).created,
                    model: (itemSanitized as JsonRecord).model,
                    choices: [],
                    usage: filterUsageForFormat(
                      usageForClient(estimated) as UsageTokenRecord,
                      sourceFormat
                    ),
                    ...((itemSanitized as JsonRecord).system_fingerprint !== undefined
                      ? { system_fingerprint: (itemSanitized as JsonRecord).system_fingerprint }
                      : {}),
                    ...((itemSanitized as JsonRecord).service_tier !== undefined
                      ? { service_tier: (itemSanitized as JsonRecord).service_tier }
                      : {}),
                  };
                  delete (itemSanitized as JsonRecord).usage;
                } else {
                  itemSanitized.usage = filterUsageForFormat(
                    usageForClient(estimated) as UsageTokenRecord,
                    sourceFormat
                  );
                }
              } else if (state.finishReason && isFinishChunk && state.usage) {
                // Add buffer and filter usage for client (but keep original in state.usage for logging)
                const buffered = addBufferToUsage(state.usage);
                if (wantsFinalUsageChunk) {
                  finalUsageChunk = {
                    id: (itemSanitized as JsonRecord).id,
                    object: "chat.completion.chunk",
                    created: (itemSanitized as JsonRecord).created,
                    model: (itemSanitized as JsonRecord).model,
                    choices: [],
                    usage: filterUsageForFormat(
                      usageForClient(buffered) as UsageTokenRecord,
                      sourceFormat
                    ),
                    ...((itemSanitized as JsonRecord).system_fingerprint !== undefined
                      ? { system_fingerprint: (itemSanitized as JsonRecord).system_fingerprint }
                      : {}),
                    ...((itemSanitized as JsonRecord).service_tier !== undefined
                      ? { service_tier: (itemSanitized as JsonRecord).service_tier }
                      : {}),
                  };
                  delete (itemSanitized as JsonRecord).usage;
                } else {
                  itemSanitized.usage = filterUsageForFormat(
                    usageForClient(buffered) as UsageTokenRecord,
                    sourceFormat
                  );
                }
              }

              const output = formatSSE(itemSanitized, sourceFormat);
              clientPayloadCollector.push(itemSanitized);
              reqLogger?.appendConvertedChunk?.(output);
              controller.enqueue(encoder.encode(output));
            }
          }
        }
      },

      flush(controller) {
        // Clean up idle watchdog timer
        if (idleTimer) {
          clearInterval(idleTimer);
          idleTimer = null;
        }
        if (streamTimedOut) {
          return;
        }
        finalized = true;
        trackPendingRequest(model, provider, connectionId, false);
        try {
          const remaining = decoder.decode();
          if (remaining) buffer += remaining;

          if (mode === STREAM_MODE.PASSTHROUGH) {
            if (buffer) {
              let output = buffer;
              if (buffer.startsWith("data:") && !buffer.startsWith("data: ")) {
                output = "data: " + buffer.slice(5);
              }
              const bufferedPayload = parseSSELine(buffer.trim());
              if (bufferedPayload) {
                providerPayloadCollector.push(bufferedPayload);
                clientPayloadCollector.push(bufferedPayload);
              }
              reqLogger?.appendConvertedChunk?.(output);
              controller.enqueue(encoder.encode(output));
            }

            // Estimate usage if provider didn't return valid usage
            if (!hasValidUsage(usage) && totalContentLength > 0) {
              usage = estimateUsage(body, totalContentLength, sourceFormat || FORMATS.OPENAI);
            }

            if (hasValidUsage(usage)) {
              logUsage(provider, usage, model, connectionId, apiKeyInfo);
              if (shouldRememberPromptUsage(body)) {
                rememberPromptUsage(
                  usageForClient(addBufferToUsage(usage)) ?? usage,
                  promptUsageKeys
                );
              } else if (compactSummarizer && promptUsageSeed) {
                rememberPromptUsage(promptUsageSeed, promptUsageKeys);
              }
            }
            // Notify caller for call log persistence (include full response body with accumulated content)
            if (onComplete) {
              try {
                const u = usage as Record<string, unknown> | null;
                const prompt = Number(u?.prompt_tokens ?? u?.input_tokens ?? 0);
                const completion = Number(u?.completion_tokens ?? u?.output_tokens ?? 0);
                const content = collapseExactDuplicateAssistantText(
                  passthroughAccumulatedContent.trim() || ""
                );
                const message: Record<string, unknown> = {
                  role: "assistant",
                  content: content || null,
                };
                const reasoning = collapseExactDuplicateAssistantText(
                  passthroughAccumulatedReasoning.trim()
                );
                if (reasoning) {
                  message.reasoning_content = reasoning;
                }
                if (passthroughToolCalls.size > 0) {
                  message.tool_calls = [...passthroughToolCalls.values()].sort(
                    (a, b) => a.index - b.index
                  );
                }
                const responseBody = {
                  choices: [
                    {
                      message,
                      finish_reason: passthroughHasToolCalls ? "tool_calls" : "stop",
                    },
                  ],
                  usage: {
                    prompt_tokens: prompt,
                    completion_tokens: completion,
                    total_tokens: prompt + completion,
                  },
                  _streamed: true,
                };
                onComplete({
                  status: 200,
                  usage,
                  responseBody,
                  providerPayload: providerPayloadCollector.build(
                    buildStreamSummaryFromEvents(
                      providerPayloadCollector.getEvents(),
                      sourceFormat,
                      model
                    ),
                    { includeEvents: false }
                  ),
                  clientPayload: clientPayloadCollector.build(responseBody, {
                    includeEvents: false,
                  }),
                });
              } catch (error) {
                console.log(
                  `[STREAM] Error building onComplete payload for disconnected/passthrough stream (model: ${model || "unknown"}):`,
                  error instanceof Error ? error.message : error
                );
              }
            }
            return;
          }

          // Translate mode: process remaining buffer
          if (buffer.trim()) {
            const parsed = parseSSELine(buffer.trim());
            if (parsed && !parsed.done) {
              providerPayloadCollector.push(parsed);
              // Extract usage from remaining buffer — if the usage-bearing event
              // (e.g. response.completed) is the last SSE line, it ends up here
              // in the flush handler where extractUsage was not called.
              // Non-destructive merge (see mergeUsageNonDestructive): some
              // providers send usage across multiple events (e.g. prompt_tokens
              // in message_start, completion_tokens in message_delta). Direct
              // assignment would lose earlier data.
              const extracted = extractUsage(parsed);
              state.usage = mergeUsageNonDestructive(state.usage as UsageTokenRecord, extracted);

              const translated = translateResponse(targetFormat, sourceFormat, parsed, state);

              // Log OpenAI intermediate chunks
              for (const item of getOpenAIIntermediateChunks(translated)) {
                const openaiOutput = formatSSE(item, FORMATS.OPENAI);
                reqLogger?.appendOpenAIChunk?.(openaiOutput);
              }

              if (translated?.length > 0) {
                for (const item of translated) {
                  const output = formatSSE(item, sourceFormat);
                  clientPayloadCollector.push(item);
                  reqLogger?.appendConvertedChunk?.(output);
                  controller.enqueue(encoder.encode(output));
                }
              }
            }
          }

          // Flush remaining events (only once at stream end)
          const flushed = translateResponse(targetFormat, sourceFormat, null, state);

          // Log OpenAI intermediate chunks for flushed events
          for (const item of getOpenAIIntermediateChunks(flushed)) {
            const openaiOutput = formatSSE(item, FORMATS.OPENAI);
            reqLogger?.appendOpenAIChunk?.(openaiOutput);
          }

          if (flushed?.length > 0) {
            for (const item of flushed) {
              const output = formatSSE(item, sourceFormat);
              clientPayloadCollector.push(item);
              reqLogger?.appendConvertedChunk?.(output);
              controller.enqueue(encoder.encode(output));
            }
          }

          /**
           * Usage emission strategy:
           * By default, usage is merged into the last content or finish chunk for
           * broad client compatibility. When OpenAI clients explicitly request
           * stream_options.include_usage, emit one final usage-only
           * chat.completion.chunk with choices: [] immediately before [DONE].
           */

          // Send final usage-only chunk before [DONE] when explicitly requested
          if (!doneSent && wantsFinalUsageChunk && finalUsageChunk?.usage) {
            const usageOutput = formatSSE(finalUsageChunk, FORMATS.OPENAI);
            clientPayloadCollector.push(finalUsageChunk);
            reqLogger?.appendConvertedChunk?.(usageOutput);
            controller.enqueue(encoder.encode(usageOutput));
          }

          // Send [DONE] (only if not already sent during transform)
          if (!doneSent) {
            doneSent = true;
            clientPayloadCollector.push({ done: true });
            const doneOutput = "data: [DONE]\n\n";
            reqLogger?.appendConvertedChunk?.(doneOutput);
            controller.enqueue(encoder.encode(doneOutput));
          }

          // Estimate usage if provider didn't return valid usage (for translate mode)
          if (!hasValidUsage(state?.usage) && totalContentLength > 0) {
            state.usage = estimateUsage(body, totalContentLength, sourceFormat);
          }

          if (hasValidUsage(state?.usage)) {
            logUsage(state.provider || targetFormat, state.usage, model, connectionId, apiKeyInfo);
            if (shouldRememberPromptUsage(body)) {
              rememberPromptUsage(
                usageForClient(addBufferToUsage(state.usage)) ?? state.usage,
                promptUsageKeys
              );
            } else if (compactSummarizer && promptUsageSeed) {
              rememberPromptUsage(promptUsageSeed, promptUsageKeys);
            }
          }
          // Notify caller for call log persistence (include full response body with accumulated content)
          if (onComplete) {
            try {
              const u = state?.usage as Record<string, unknown> | null | undefined;
              const prompt = Number(u?.prompt_tokens ?? u?.input_tokens ?? 0);
              const completion = Number(u?.completion_tokens ?? u?.output_tokens ?? 0);
              const content = collapseExactDuplicateAssistantText(
                (state?.accumulatedContent ?? "").trim() || ""
              );
              const message: Record<string, unknown> = {
                role: "assistant",
                content: content || null,
              };
              const hasToolCalls = state?.toolCalls?.size > 0;
              if (hasToolCalls) {
                // Normalize shape — translators may store different structures
                message.tool_calls = [...state.toolCalls.values()]
                  .map((tc: Record<string, unknown>): ToolCall => ({
                    id: (tc.id as string) ?? null,
                    index: (tc.index as number) ?? (tc.blockIndex as number) ?? 0,
                    type: (tc.type as string) ?? "function",
                    function: (tc.function as ToolCall["function"]) ?? {
                      name: (tc.name as string) ?? "",
                      arguments: "",
                    },
                  }))
                  .sort((a, b) => a.index - b.index);
              }
              const responseBody = {
                choices: [
                  {
                    message,
                    finish_reason: hasToolCalls ? "tool_calls" : "stop",
                  },
                ],
                usage: {
                  prompt_tokens: prompt,
                  completion_tokens: completion,
                  total_tokens: prompt + completion,
                },
                _streamed: true,
              };
              onComplete({
                status: 200,
                usage: state?.usage,
                responseBody,
                providerPayload: providerPayloadCollector.build(
                  buildStreamSummaryFromEvents(
                    providerPayloadCollector.getEvents(),
                    targetFormat,
                    model
                  ),
                  { includeEvents: false }
                ),
                clientPayload: clientPayloadCollector.build(responseBody, {
                  includeEvents: false,
                }),
              });
            } catch (error) {
              console.log(
                `[STREAM] Error building onComplete payload in flush (model: ${model || "unknown"}):`,
                error instanceof Error ? error.message : error
              );
            }
          }
        } catch (error) {
          console.log(`[STREAM] Error in flush (${model || "unknown"}):`, error.message || error);
        }
      },

      cancel() {
        // Client disconnected mid-stream: flush() will never run for this
        // reader, so finalize accounting here instead of leaking the pending
        // slot and silently dropping tokens already spent upstream.
        if (idleTimer) {
          clearInterval(idleTimer);
          idleTimer = null;
        }
        if (streamTimedOut || finalized) return;
        finalized = true;
        console.warn(
          `[STREAM] Client disconnected mid-stream (provider: ${provider || "unknown"}, model: ${model || "unknown"}, connectionId: ${connectionId || "n/a"}) — finalizing partial usage`
        );
        trackPendingRequest(model, provider, connectionId, false);

        const isPassthrough = mode === STREAM_MODE.PASSTHROUGH;
        let partialUsage = (isPassthrough ? usage : state?.usage) as UsageTokenRecord | null;
        if (!hasValidUsage(partialUsage) && totalContentLength > 0) {
          partialUsage = estimateUsage(body, totalContentLength, sourceFormat || FORMATS.OPENAI);
        }
        if (isPassthrough) {
          usage = partialUsage;
        } else if (state) {
          state.usage = partialUsage;
        }
        if (hasValidUsage(partialUsage)) {
          logUsage(
            isPassthrough
              ? provider
              : (state?.provider as string | null | undefined) || targetFormat,
            partialUsage,
            model,
            connectionId,
            apiKeyInfo
          );
        }

        if (!onComplete) return;
        try {
          const u = partialUsage as Record<string, unknown> | null;
          const prompt = Number(u?.prompt_tokens ?? u?.input_tokens ?? 0);
          const completion = Number(u?.completion_tokens ?? u?.output_tokens ?? 0);
          const contentSource = isPassthrough
            ? passthroughAccumulatedContent
            : (state?.accumulatedContent ?? "");
          const message: Record<string, unknown> = {
            role: "assistant",
            content: collapseExactDuplicateAssistantText(contentSource.trim()) || null,
          };
          let finishReason = "stop";
          if (isPassthrough) {
            const reasoning = collapseExactDuplicateAssistantText(
              passthroughAccumulatedReasoning.trim()
            );
            if (reasoning) {
              message.reasoning_content = reasoning;
            }
            if (passthroughToolCalls.size > 0) {
              message.tool_calls = [...passthroughToolCalls.values()].sort(
                (a, b) => a.index - b.index
              );
              finishReason = "tool_calls";
            }
          } else if (state?.toolCalls?.size > 0) {
            message.tool_calls = [...state.toolCalls.values()]
              .map((tc: Record<string, unknown>): ToolCall => ({
                id: (tc.id as string) ?? null,
                index: (tc.index as number) ?? (tc.blockIndex as number) ?? 0,
                type: (tc.type as string) ?? "function",
                function: (tc.function as ToolCall["function"]) ?? {
                  name: (tc.name as string) ?? "",
                  arguments: "",
                },
              }))
              .sort((a, b) => a.index - b.index);
            finishReason = "tool_calls";
          }
          const responseBody = {
            choices: [
              {
                message,
                finish_reason: finishReason,
              },
            ],
            usage: {
              prompt_tokens: prompt,
              completion_tokens: completion,
              total_tokens: prompt + completion,
            },
            _streamed: true,
            _disconnected: true,
          };
          onComplete({
            status: 499, // Client Closed Request — partial-usage semantics
            usage: partialUsage,
            responseBody,
            providerPayload: providerPayloadCollector.build(
              buildStreamSummaryFromEvents(
                providerPayloadCollector.getEvents(),
                isPassthrough ? sourceFormat : targetFormat,
                model
              ),
              { includeEvents: false }
            ),
            clientPayload: clientPayloadCollector.build(responseBody, {
              includeEvents: false,
            }),
          });
        } catch (error) {
          console.log(
            `[STREAM] Error finalizing disconnected stream (${model || "unknown"}):`,
            error instanceof Error ? error.message : error
          );
        }
      },
    } as unknown as Transformer<Uint8Array, Uint8Array>,
    // Writable side backpressure — limit buffered chunks to avoid unbounded memory
    { highWaterMark: 16 },
    // Readable side backpressure — limit queued output chunks
    { highWaterMark: 16 }
  );
}
