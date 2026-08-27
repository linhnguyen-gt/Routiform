/**
 * Convert the AWS EventStream binary response into an SSE text stream.
 *
 * Each Kiro event type (reasoning / assistant response / code / tool use /
 * message stop / usage events) maps onto an OpenAI-style chat.completion.chunk.
 * The finish_reason chunk is emitted exactly once — see the "Exactly-one-finish
 * invariant" note below.
 *
 * @module executors/kiro/event-stream
 */
import { CONTEXT_CONFIG } from "../../../src/shared/constants/context";
import { generateToolCallId } from "../../translator/helpers/toolCallHelper.ts";
import { parseEventFrame } from "./event-frame.ts";
import { stripThinkingTags } from "./thinking-tags.ts";
import type { JsonRecord, KiroStreamRuntime } from "./types.ts";

export function transformKiroEventStreamToSSE(response: Response, model: string): Response {
  let buffer = new Uint8Array(0);
  let chunkIndex = 0;
  const responseId = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const runtime: KiroStreamRuntime = {
    responseId,
    created,
    model,
    chunkIndex,
    state: {
      endDetected: false,
      finishEmitted: false,
      hasToolCalls: false,
      toolCallIndex: 0,
      seenToolIds: new Map(),
      thinkingBuffer: "",
      thinkingInTag: false,
      inCodeFence: false,
    },
  };
  // ── Exactly-one-finish invariant ──────────────────────────────────────────
  // Kiro's event order is not guaranteed: meteringEvent / contextUsageEvent /
  // metricsEvent may arrive before OR after messageStopEvent. The finish_reason
  // chunk is therefore emitted exactly once, by whichever event completes the
  // last missing piece:
  //   - usage tokens from metricsEvent (authoritative), or
  //   - metering + contextUsage both seen (usage estimated below), or
  //   - flush() for truncated streams where usage never arrives.
  // Usage attaches to that single chunk regardless of arrival order; no
  // duplicate finish chunks and no dropped usage.
  const tryEmitFinish = (controller: TransformStreamDefaultController<Uint8Array>) => {
    const { state } = runtime;
    if (!state.messageStopSeen || state.finishEmitted) return;
    const usageInputsSettled = !!state.usage || !!(state.hasMeteringEvent && state.hasContextUsage);
    if (!usageInputsSettled) return;
    state.finishEmitted = true;

    if (!state.usage) {
      // Estimate output tokens from content length
      const estimatedOutputTokens =
        state.totalContentLength > 0 ? Math.max(1, Math.floor(state.totalContentLength / 4)) : 0;

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
      id: runtime.responseId,
      object: "chat.completion.chunk",
      created: runtime.created,
      model: runtime.model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: state.hasToolCalls ? "tool_calls" : "stop",
        },
      ],
      usage: state.usage,
    };
    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(finishChunk)}\n\n`));
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
        if (!runtime.state.totalContentLength) runtime.state.totalContentLength = 0;
        if (!runtime.state.contextUsagePercentage) runtime.state.contextUsagePercentage = 0;

        // Handle reasoningContentEvent — Kiro sends this for thinking/reasoning content
        // Emit as reasoning_content so the openai-to-claude translator can map it to
        // a Claude thinking content block (shows thinking panel in Claude Code CLI).
        if (eventType === "reasoningContentEvent") {
          const content = typeof event.payload?.content === "string" ? event.payload.content : "";
          if (!content) {
            continue;
          }

          const chunk: JsonRecord = {
            id: runtime.responseId,
            object: "chat.completion.chunk",
            created: runtime.created,
            model: runtime.model,
            choices: [
              {
                index: 0,
                delta:
                  runtime.chunkIndex === 0
                    ? { role: "assistant", reasoning_content: content }
                    : { reasoning_content: content },
                finish_reason: null,
              },
            ],
          };
          runtime.chunkIndex++;
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
          const content = stripThinkingTags(runtime.state, rawContent);
          if (!content) {
            continue;
          }
          runtime.state.totalContentLength += content.length;

          const chunk: JsonRecord = {
            id: runtime.responseId,
            object: "chat.completion.chunk",
            created: runtime.created,
            model: runtime.model,
            choices: [
              {
                index: 0,
                delta: runtime.chunkIndex === 0 ? { role: "assistant", content } : { content },
                finish_reason: null,
              },
            ],
          };
          runtime.chunkIndex++;
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }

        // Handle codeEvent
        if (eventType === "codeEvent" && event.payload?.content) {
          const chunk: JsonRecord = {
            id: runtime.responseId,
            object: "chat.completion.chunk",
            created: runtime.created,
            model: runtime.model,
            choices: [
              {
                index: 0,
                delta: { content: event.payload.content },
                finish_reason: null,
              },
            ],
          };
          runtime.chunkIndex++;
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }

        // Handle toolUseEvent
        if (eventType === "toolUseEvent" && event.payload) {
          runtime.state.hasToolCalls = true;
          const toolUse = event.payload;
          const toolUses = Array.isArray(toolUse) ? toolUse : [toolUse];

          for (const singleToolUse of toolUses) {
            const toolCallId =
              singleToolUse.toolUseId ||
              generateToolCallId({
                source: "kiro-executor-tool-use",
                occurrence: runtime.state.toolCallIndex,
                name: singleToolUse.name || "",
                input: singleToolUse.input,
              });
            const toolName = singleToolUse.name || "";
            const toolInput = singleToolUse.input;

            let toolIndex;
            const isNewTool = !runtime.state.seenToolIds.has(toolCallId);

            if (isNewTool) {
              toolIndex = runtime.state.toolCallIndex++;
              runtime.state.seenToolIds.set(toolCallId, toolIndex);

              const startChunk = {
                id: runtime.responseId,
                object: "chat.completion.chunk",
                created: runtime.created,
                model: runtime.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      ...(runtime.chunkIndex === 0 ? { role: "assistant" } : {}),
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
              runtime.chunkIndex++;
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify(startChunk)}\n\n`)
              );
            } else {
              toolIndex = runtime.state.seenToolIds.get(toolCallId);
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
                id: runtime.responseId,
                object: "chat.completion.chunk",
                created: runtime.created,
                model: runtime.model,
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
              runtime.chunkIndex++;
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify(argsChunk)}\n\n`)
              );
            }
          }
        }

        // Handle messageStopEvent — do NOT emit the finish chunk here.
        // Usage events (metering/contextUsage/metrics) may still follow; the
        // single finish_reason chunk is emitted by tryEmitFinish once usage
        // settles (or by flush for truncated streams).
        if (eventType === "messageStopEvent") {
          runtime.state.messageStopSeen = true;
          tryEmitFinish(controller);
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
          runtime.state.contextUsagePercentage = contextUsage;
          // Mark that we received context usage event
          runtime.state.hasContextUsage = true;
          tryEmitFinish(controller);
        }

        // Handle meteringEvent - mark that we received it
        if (eventType === "meteringEvent") {
          runtime.state.hasMeteringEvent = true;
          tryEmitFinish(controller);
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
              runtime.state.usage = {
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
          tryEmitFinish(controller);
        }
      }

      if (iterations >= maxIterations) {
        console.warn("[Kiro] Max iterations reached in event parsing");
      }
    },

    flush(controller) {
      const { state } = runtime;
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
          id: runtime.responseId,
          object: "chat.completion.chunk",
          created: runtime.created,
          model: runtime.model,
          choices: [
            {
              index: 0,
              delta:
                runtime.chunkIndex === 0
                  ? { role: "assistant", content: leftover }
                  : { content: leftover },
              finish_reason: null,
            },
          ],
        };
        runtime.chunkIndex++;
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(leftoverChunk)}\n\n`));
      }

      // Last-resort finish: truncated streams (upstream cut off before usage
      // events, or messageStop never arrived) still get exactly one
      // finish_reason chunk so clients see a well-formed SSE terminator.
      if (!state.finishEmitted) {
        state.finishEmitted = true;
        const finishChunk = {
          id: runtime.responseId,
          object: "chat.completion.chunk",
          created: runtime.created,
          model: runtime.model,
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
