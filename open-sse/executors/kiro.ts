import { v4 as uuidv4 } from "uuid";
import { CONTEXT_CONFIG } from "../../src/shared/constants/context";
import { PROVIDERS } from "../config/constants.ts";
import { refreshKiroToken } from "../services/tokenRefresh.ts";
import { generateToolCallId } from "../translator/helpers/toolCallHelper.ts";
import {
  BaseExecutor,
  mergeUpstreamExtraHeaders,
  type ExecuteInput,
  type ExecutorLog,
  type ProviderCredentials,
} from "./base.ts";

type JsonRecord = Record<string, unknown>;

type UsageSummary = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

type KiroStreamState = {
  endDetected: boolean;
  finishEmitted: boolean;
  hasToolCalls: boolean;
  toolCallIndex: number;
  seenToolIds: Map<string, number>;
  totalContentLength?: number;
  contextUsagePercentage?: number;
  hasContextUsage?: boolean;
  hasMeteringEvent?: boolean;
  usage?: UsageSummary;
  /** Carry buffer for stripThinkingTags — a <thinking>/</thinking>/``` marker can straddle events. */
  thinkingBuffer: string;
  /** True while inside an unterminated <thinking>...</thinking> span. */
  thinkingInTag: boolean;
  /** True while inside a fenced code block (```...```) — <thinking> markers here are literal text. */
  inCodeFence: boolean;
};

const THINKING_OPEN = "<thinking>";
const THINKING_CLOSE = "</thinking>";
const CODE_FENCE = "```";

/**
 * Length of the longest suffix of `text` that is also a prefix of `tag` — used to detect
 * a tag opening/closing marker split across two assistantResponseEvent frames, so we don't
 * emit a partial "<thi" fragment as visible content.
 */
function partialTagOverlapLength(text: string, tag: string): number {
  const max = Math.min(text.length, tag.length - 1);
  for (let len = max; len > 0; len--) {
    if (text.endsWith(tag.slice(0, len))) return len;
  }
  return 0;
}

/** Longest tail overlap of `text` against any candidate marker — the amount that must be
 * held back because a future chunk could complete it into a real marker. */
function maxPartialOverlap(text: string, tags: string[]): number {
  let max = 0;
  for (const tag of tags) {
    const overlap = partialTagOverlapLength(text, tag);
    if (overlap > max) max = overlap;
  }
  return max;
}

/**
 * Strip literal <thinking>...</thinking> spans from assistantResponseEvent content before
 * forwarding to the client. Claude models on Kiro emit these inline, duplicating what
 * reasoningContentEvent already delivers as reasoning_content. Stateful across calls so a
 * tag split across two events (chunk boundary) is still stripped correctly.
 *
 * A <thinking> marker found inside a fenced code block (```...```) is treated as literal
 * text, not a real tag — Kiro drives coding agents that legitimately discuss prompt/tag
 * formats in code fences, and stripping those would corrupt the code sample.
 *
 * This function only ever DROPS bytes when they fall between a real (non-fenced)
 * <thinking> and its matching </thinking>. Every other byte — including one caught
 * inside an unterminated <thinking> span — is either emitted here or held in
 * state.thinkingBuffer for the caller to flush at stream end (see flush() below), so a
 * missing closing tag can never silently truncate the response.
 */
function stripThinkingTags(state: KiroStreamState, chunk: string): string {
  state.thinkingBuffer += chunk;
  let out = "";

  for (;;) {
    if (state.thinkingInTag) {
      const closeIdx = state.thinkingBuffer.indexOf(THINKING_CLOSE);
      if (closeIdx === -1) {
        // Still inside the thinking span (or the closing tag hasn't fully arrived yet).
        // Thinking content is discarded here, but the caller flushes it as plain text
        // at stream end if no closing tag ever shows up — see flush().
        return out;
      }
      state.thinkingBuffer = state.thinkingBuffer.slice(closeIdx + THINKING_CLOSE.length);
      state.thinkingInTag = false;
      continue;
    }

    if (state.inCodeFence) {
      const fenceIdx = state.thinkingBuffer.indexOf(CODE_FENCE);
      if (fenceIdx === -1) {
        // Inside a fenced code block — pass everything through verbatim; <thinking>
        // markers here are literal text, not a real tag.
        const overlap = partialTagOverlapLength(state.thinkingBuffer, CODE_FENCE);
        out += state.thinkingBuffer.slice(0, state.thinkingBuffer.length - overlap);
        state.thinkingBuffer = overlap > 0 ? state.thinkingBuffer.slice(-overlap) : "";
        return out;
      }
      out += state.thinkingBuffer.slice(0, fenceIdx + CODE_FENCE.length);
      state.thinkingBuffer = state.thinkingBuffer.slice(fenceIdx + CODE_FENCE.length);
      state.inCodeFence = false;
      continue;
    }

    // Not in a fence and not in a thinking span — whichever marker (fence open or
    // thinking open) appears first in the buffer determines what happens next.
    const fenceIdx = state.thinkingBuffer.indexOf(CODE_FENCE);
    const openIdx = state.thinkingBuffer.indexOf(THINKING_OPEN);

    if (fenceIdx === -1 && openIdx === -1) {
      // Neither marker fully present — hold back a possible partial marker at the tail
      // (e.g. buffer ends with "<thin" or "``") so it doesn't leak into visible output.
      const overlap = maxPartialOverlap(state.thinkingBuffer, [CODE_FENCE, THINKING_OPEN]);
      out += state.thinkingBuffer.slice(0, state.thinkingBuffer.length - overlap);
      state.thinkingBuffer = overlap > 0 ? state.thinkingBuffer.slice(-overlap) : "";
      return out;
    }

    if (fenceIdx !== -1 && (openIdx === -1 || fenceIdx < openIdx)) {
      out += state.thinkingBuffer.slice(0, fenceIdx + CODE_FENCE.length);
      state.thinkingBuffer = state.thinkingBuffer.slice(fenceIdx + CODE_FENCE.length);
      state.inCodeFence = true;
      continue;
    }

    out += state.thinkingBuffer.slice(0, openIdx);
    state.thinkingBuffer = state.thinkingBuffer.slice(openIdx + THINKING_OPEN.length);
    state.thinkingInTag = true;
  }
}

type EventFrame = {
  headers: Record<string, string>;
  payload: JsonRecord | null;
};

// ── CRC32 lookup table (IEEE polynomial, no dependency) ──
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

function crc32(buf: Uint8Array) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// AWS region ids only ("us-east-1", "eu-west-1", ...) — guards against building a bogus
// host from an unexpected providerSpecificData.region value.
const AWS_REGION_RE = /^[a-z]{2}-[a-z]+-\d$/;
const KIRO_DEFAULT_REGION = "us-east-1";

/**
 * KiroExecutor - Executor for Kiro AI (AWS CodeWhisperer)
 * Uses AWS CodeWhisperer streaming API with AWS EventStream binary format
 */
export class KiroExecutor extends BaseExecutor {
  constructor() {
    super("kiro", PROVIDERS.kiro);
  }

  /**
   * Build the CodeWhisperer host from the connection's stored region (IdC/SSO accounts can
   * live outside us-east-1 — using the wrong host returns 403). Falls back to us-east-1 when
   * no region is persisted or the value doesn't look like an AWS region id.
   */
  buildUrl(
    model: string,
    stream: boolean,
    urlIndex = 0,
    credentials: ProviderCredentials | null = null
  ): string {
    void model;
    void stream;
    void urlIndex;
    const storedRegion = credentials?.providerSpecificData?.region;
    const region =
      typeof storedRegion === "string" && AWS_REGION_RE.test(storedRegion)
        ? storedRegion
        : KIRO_DEFAULT_REGION;
    const baseUrl =
      this.config.baseUrl ||
      `https://codewhisperer.${KIRO_DEFAULT_REGION}.amazonaws.com/generateAssistantResponse`;
    return baseUrl.replace(
      /codewhisperer\.[a-z0-9-]+\.amazonaws\.com/,
      `codewhisperer.${region}.amazonaws.com`
    );
  }

  buildHeaders(credentials: ProviderCredentials, stream = true) {
    void stream;
    const headers = {
      ...this.config.headers,
      "Amz-Sdk-Request": "attempt=1; max=3",
      "Amz-Sdk-Invocation-Id": uuidv4(),
      "x-amzn-bedrock-cache-control": "enable",
      "anthropic-beta": "prompt-caching-2024-07-31",
    };

    if (credentials.accessToken) {
      headers["Authorization"] = `Bearer ${credentials.accessToken}`;
    }

    return headers;
  }

  transformRequest(model: string, body: unknown, stream: boolean, credentials: unknown): unknown {
    void stream;
    void credentials;
    // Kiro uses conversationState.currentMessage.userInputMessage.modelId,
    // not a top-level "model" field. chatCore injects translatedBody.model
    // which Kiro API rejects as unknown top-level field.
    const { model: _model, ...rest } = body as Record<string, unknown>;
    return rest;
  }

  /**
   * Custom execute for Kiro - handles AWS EventStream binary response
   */
  async execute({ model, body, stream, credentials, signal, upstreamExtraHeaders }: ExecuteInput) {
    const url = this.buildUrl(model, stream, 0, credentials);
    const headers = this.buildHeaders(credentials, stream);
    mergeUpstreamExtraHeaders(headers, upstreamExtraHeaders);
    const transformedBody = await this.transformRequest(model, body, stream, credentials);

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(transformedBody),
      signal,
    });

    if (!response.ok) {
      return { response, url, headers, transformedBody };
    }

    // For Kiro, we need to transform the binary EventStream to SSE
    // Create a TransformStream to convert binary to SSE text
    const transformedResponse = this.transformEventStreamToSSE(response, model);

    return { response: transformedResponse, url, headers, transformedBody };
  }

  /**
   * Transform AWS EventStream binary response to SSE text stream
   * Using TransformStream instead of ReadableStream.pull() to avoid Workers timeout
   */
  transformEventStreamToSSE(response: Response, model: string) {
    let buffer = new Uint8Array(0);
    let chunkIndex = 0;
    const responseId = `chatcmpl-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    const state: KiroStreamState = {
      endDetected: false,
      finishEmitted: false,
      hasToolCalls: false,
      toolCallIndex: 0,
      seenToolIds: new Map(),
      thinkingBuffer: "",
      thinkingInTag: false,
      inCodeFence: false,
    };

    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        // Append to buffer
        const newBuffer = new Uint8Array(buffer.length + chunk.length);
        newBuffer.set(buffer);
        newBuffer.set(chunk, buffer.length);
        buffer = newBuffer;

        // Parse events from buffer
        let iterations = 0;
        const maxIterations = 1000;
        while (buffer.length >= 16 && iterations < maxIterations) {
          iterations++;
          const view = new DataView(buffer.buffer, buffer.byteOffset);
          const totalLength = view.getUint32(0, false);

          if (totalLength < 16 || totalLength > buffer.length || buffer.length < totalLength) break;

          const eventData = buffer.slice(0, totalLength);
          buffer = buffer.slice(totalLength);

          const event = parseEventFrame(eventData);
          if (!event) continue;

          const eventType = event.headers[":event-type"] || "";

          // Track total content length for token estimation
          if (!state.totalContentLength) state.totalContentLength = 0;
          if (!state.contextUsagePercentage) state.contextUsagePercentage = 0;

          // Handle reasoningContentEvent — Kiro sends this for thinking/reasoning content
          // Emit as reasoning_content so the openai-to-claude translator can map it to
          // a Claude thinking content block (shows thinking panel in Claude Code CLI).
          if (eventType === "reasoningContentEvent") {
            const content = typeof event.payload?.content === "string" ? event.payload.content : "";
            if (!content) {
              continue;
            }

            const chunk: JsonRecord = {
              id: responseId,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [
                {
                  index: 0,
                  delta:
                    chunkIndex === 0
                      ? { role: "assistant", reasoning_content: content }
                      : { reasoning_content: content },
                  finish_reason: null,
                },
              ],
            };
            chunkIndex++;
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }

          // Handle assistantResponseEvent
          if (eventType === "assistantResponseEvent") {
            const rawContent =
              typeof event.payload?.content === "string" ? event.payload.content : "";
            if (!rawContent) {
              continue;
            }
            // Strip literal <thinking> tags — duplicated by reasoningContentEvent above.
            const content = stripThinkingTags(state, rawContent);
            if (!content) {
              continue;
            }
            state.totalContentLength += content.length;

            const chunk: JsonRecord = {
              id: responseId,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [
                {
                  index: 0,
                  delta: chunkIndex === 0 ? { role: "assistant", content } : { content },
                  finish_reason: null,
                },
              ],
            };
            chunkIndex++;
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }

          // Handle codeEvent
          if (eventType === "codeEvent" && event.payload?.content) {
            const chunk: JsonRecord = {
              id: responseId,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [
                {
                  index: 0,
                  delta: { content: event.payload.content },
                  finish_reason: null,
                },
              ],
            };
            chunkIndex++;
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }

          // Handle toolUseEvent
          if (eventType === "toolUseEvent" && event.payload) {
            state.hasToolCalls = true;
            const toolUse = event.payload;
            const toolUses = Array.isArray(toolUse) ? toolUse : [toolUse];

            for (const singleToolUse of toolUses) {
              const toolCallId =
                singleToolUse.toolUseId ||
                generateToolCallId({
                  source: "kiro-executor-tool-use",
                  occurrence: state.toolCallIndex,
                  name: singleToolUse.name || "",
                  input: singleToolUse.input,
                });
              const toolName = singleToolUse.name || "";
              const toolInput = singleToolUse.input;

              let toolIndex;
              const isNewTool = !state.seenToolIds.has(toolCallId);

              if (isNewTool) {
                toolIndex = state.toolCallIndex++;
                state.seenToolIds.set(toolCallId, toolIndex);

                const startChunk = {
                  id: responseId,
                  object: "chat.completion.chunk",
                  created,
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: {
                        ...(chunkIndex === 0 ? { role: "assistant" } : {}),
                        tool_calls: [
                          {
                            index: toolIndex,
                            id: toolCallId,
                            type: "function",
                            function: {
                              name: toolName,
                              arguments: "",
                            },
                          },
                        ],
                      },
                      finish_reason: null,
                    },
                  ],
                };
                chunkIndex++;
                controller.enqueue(
                  new TextEncoder().encode(`data: ${JSON.stringify(startChunk)}\n\n`)
                );
              } else {
                toolIndex = state.seenToolIds.get(toolCallId);
              }

              if (toolInput !== undefined) {
                let argumentsStr;

                if (typeof toolInput === "string") {
                  argumentsStr = toolInput;
                } else if (typeof toolInput === "object") {
                  argumentsStr = JSON.stringify(toolInput);
                } else {
                  continue;
                }

                const argsChunk = {
                  id: responseId,
                  object: "chat.completion.chunk",
                  created,
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: {
                        tool_calls: [
                          {
                            index: toolIndex,
                            function: {
                              arguments: argumentsStr,
                            },
                          },
                        ],
                      },
                      finish_reason: null,
                    },
                  ],
                };
                chunkIndex++;
                controller.enqueue(
                  new TextEncoder().encode(`data: ${JSON.stringify(argsChunk)}\n\n`)
                );
              }
            }
          }

          // Handle messageStopEvent
          if (eventType === "messageStopEvent") {
            const chunk: JsonRecord = {
              id: responseId,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: state.hasToolCalls ? "tool_calls" : "stop",
                },
              ],
            };
            state.finishEmitted = true;
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }

          // Handle contextUsageEvent to extract contextUsagePercentage
          if (eventType === "contextUsageEvent") {
            const contextUsage =
              typeof event.payload?.contextUsagePercentage === "number"
                ? event.payload.contextUsagePercentage
                : 0;
            if (contextUsage <= 0) {
              continue;
            }
            state.contextUsagePercentage = contextUsage;
            // Mark that we received context usage event
            state.hasContextUsage = true;
          }

          // Handle meteringEvent - mark that we received it
          if (eventType === "meteringEvent") {
            state.hasMeteringEvent = true;
          }

          // Handle metricsEvent for token usage
          if (eventType === "metricsEvent") {
            // Extract usage data from metricsEvent payload
            const metrics = event.payload?.metricsEvent || event.payload;
            if (metrics && typeof metrics === "object") {
              const inputTokens =
                typeof (metrics as JsonRecord).inputTokens === "number"
                  ? ((metrics as JsonRecord).inputTokens as number)
                  : 0;
              const outputTokens =
                typeof (metrics as JsonRecord).outputTokens === "number"
                  ? ((metrics as JsonRecord).outputTokens as number)
                  : 0;

              const cacheReadTokens =
                typeof (metrics as JsonRecord).cacheReadTokens === "number"
                  ? ((metrics as JsonRecord).cacheReadTokens as number)
                  : 0;

              const cacheCreationTokens =
                typeof (metrics as JsonRecord).cacheCreationTokens === "number"
                  ? ((metrics as JsonRecord).cacheCreationTokens as number)
                  : 0;

              if (inputTokens > 0 || outputTokens > 0) {
                state.usage = {
                  prompt_tokens: inputTokens,
                  completion_tokens: outputTokens,
                  total_tokens: inputTokens + outputTokens,
                  ...(cacheReadTokens > 0 && { cache_read_input_tokens: cacheReadTokens }),
                  ...(cacheCreationTokens > 0 && {
                    cache_creation_input_tokens: cacheCreationTokens,
                  }),
                };
              }
            }
          }

          // Emit final chunk only after receiving BOTH meteringEvent AND contextUsageEvent
          if (state.hasMeteringEvent && state.hasContextUsage && !state.finishEmitted) {
            state.finishEmitted = true;

            // Estimate tokens if not available from events
            if (!state.usage) {
              // Estimate output tokens from content length
              const estimatedOutputTokens =
                state.totalContentLength > 0
                  ? Math.max(1, Math.floor(state.totalContentLength / 4))
                  : 0;

              // Estimate input tokens from contextUsagePercentage
              // Kiro models typically have 200k context window
              const estimatedInputTokens =
                state.contextUsagePercentage > 0
                  ? Math.floor((state.contextUsagePercentage * CONTEXT_CONFIG.defaultLimit) / 100)
                  : 0;

              state.usage = {
                prompt_tokens: estimatedInputTokens,
                completion_tokens: estimatedOutputTokens,
                total_tokens: estimatedInputTokens + estimatedOutputTokens,
              };
            }

            const finishChunk: JsonRecord = {
              id: responseId,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: state.hasToolCalls ? "tool_calls" : "stop",
                },
              ],
            };

            // Include usage in final chunk if available
            if (state.usage) {
              finishChunk.usage = state.usage;
            }

            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify(finishChunk)}\n\n`)
            );
          }
        }

        if (iterations >= maxIterations) {
          console.warn("[Kiro] Max iterations reached in event parsing");
        }
      },

      flush(controller) {
        // Flush any buffered text that stripThinkingTags held back — whether it was a
        // possible tag/fence continuation that never fully materialized, or content
        // trapped inside an unterminated <thinking> span (no matching </thinking> ever
        // arrived, e.g. a model discussing tag formats without closing one, or a real
        // stream cutoff). Losing real response content is strictly worse than leaking a
        // stray "<thinking>" marker, so ANY leftover buffer is emitted as plain text
        // rather than dropped — regardless of state.thinkingInTag.
        if (state.thinkingBuffer) {
          const leftover = state.thinkingBuffer;
          state.thinkingBuffer = "";
          state.thinkingInTag = false;
          const leftoverChunk: JsonRecord = {
            id: responseId,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [
              {
                index: 0,
                delta:
                  chunkIndex === 0
                    ? { role: "assistant", content: leftover }
                    : { content: leftover },
                finish_reason: null,
              },
            ],
          };
          chunkIndex++;
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(leftoverChunk)}\n\n`)
          );
        }

        // Emit finish chunk if not already sent
        if (!state.finishEmitted) {
          state.finishEmitted = true;
          const finishChunk = {
            id: responseId,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: state.hasToolCalls ? "tool_calls" : "stop",
              },
            ],
          };
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(finishChunk)}\n\n`));
        }

        // Send final done message
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      },
    });

    // Pipe response body through transform stream
    const transformedStream = response.body.pipeThrough(transformStream);

    return new Response(transformedStream, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  async refreshCredentials(credentials: ProviderCredentials, log?: ExecutorLog | null) {
    if (!credentials.refreshToken) return null;

    try {
      // Use centralized refreshKiroToken function (handles both AWS SSO OIDC and Social Auth)
      const result = await refreshKiroToken(
        credentials.refreshToken,
        credentials.providerSpecificData,
        log
      );

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log?.error?.("TOKEN", `Kiro refresh error: ${err.message}`);
      return null;
    }
  }
}

/**
 * Parse AWS EventStream frame
 */
function parseEventFrame(data: Uint8Array): EventFrame | null {
  try {
    const view = new DataView(data.buffer, data.byteOffset);
    const _totalLength = view.getUint32(0, false);
    const headersLength = view.getUint32(4, false);

    // ── CRC32 validation ──
    // Prelude CRC covers bytes [0..7] (totalLength + headersLength)
    const preludeCRC = view.getUint32(8, false);
    const computedPreludeCRC = crc32(data.slice(0, 8));
    if (preludeCRC !== computedPreludeCRC) {
      console.warn(
        `[Kiro] Prelude CRC mismatch: expected ${preludeCRC}, got ${computedPreludeCRC} — skipping corrupted frame`
      );
      return null;
    }

    // Message CRC covers bytes [0..totalLength-5] (everything except the CRC itself)
    const messageCRC = view.getUint32(data.length - 4, false);
    const computedMessageCRC = crc32(data.slice(0, data.length - 4));
    if (messageCRC !== computedMessageCRC) {
      console.warn(
        `[Kiro] Message CRC mismatch: expected ${messageCRC}, got ${computedMessageCRC} — skipping corrupted frame`
      );
      return null;
    }
    // Parse headers
    const headers: Record<string, string> = {};
    let offset = 12; // After prelude
    const headerEnd = 12 + headersLength;

    while (offset < headerEnd && offset < data.length) {
      const nameLen = data[offset];
      offset++;
      if (offset + nameLen > data.length) break;

      const name = new TextDecoder().decode(data.slice(offset, offset + nameLen));
      offset += nameLen;

      const headerType = data[offset];
      offset++;

      if (headerType === 7) {
        // String type
        const valueLen = (data[offset] << 8) | data[offset + 1];
        offset += 2;
        if (offset + valueLen > data.length) break;

        const value = new TextDecoder().decode(data.slice(offset, offset + valueLen));
        offset += valueLen;
        headers[name] = value;
      } else {
        break;
      }
    }

    // Parse payload
    const payloadStart = 12 + headersLength;
    const payloadEnd = data.length - 4; // Exclude message CRC

    let payload: JsonRecord | null = null;
    if (payloadEnd > payloadStart) {
      const payloadStr = new TextDecoder().decode(data.slice(payloadStart, payloadEnd));

      // Skip empty or whitespace-only payloads
      if (!payloadStr || !payloadStr.trim()) {
        return { headers, payload: null };
      }

      try {
        payload = JSON.parse(payloadStr);
      } catch (parseError) {
        const err = parseError instanceof Error ? parseError : new Error(String(parseError));
        // Log parse error for debugging
        console.warn(
          `[Kiro] Failed to parse payload: ${err.message} | payload: ${payloadStr.substring(0, 100)}`
        );
        payload = { raw: payloadStr };
      }
    }

    return { headers, payload };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.warn(`[Kiro] Frame parse error: ${error.message}`);
    return null;
  }
}

export default KiroExecutor;
