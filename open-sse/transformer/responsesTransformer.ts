import * as fs from "fs";
import * as path from "path";
/**
 * Responses API Transformer
 * Converts OpenAI Chat Completions SSE to Codex Responses API SSE format
 * Can be used in both Next.js and Cloudflare Workers
 */

import { consumeThinkContent, flushThinkContent } from "../utils/thinkTagStream.ts";

// Dynamic import for Node.js-only modules (fs/path unavailable in Workers)
let _fs = null;
let _path = null;
async function _getFs() {
  if (_fs === null) {
    try {
      _fs = (await import("fs")).default;
    } catch {
      _fs = false;
    }
  }
  return _fs || null;
}
async function _getPath() {
  if (_path === null) {
    try {
      _path = (await import("path")).default;
    } catch {
      _path = false;
    }
  }
  return _path || null;
}

// Create log directory for responses (Node.js only)
export function createResponsesLogger(model, logsDir = null) {
  // Skip logging in worker environment (no fs)
  if (typeof fs.mkdirSync !== "function") {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  const uniqueId = Math.random().toString(36).slice(2, 8);
  const baseDir = logsDir || (typeof process !== "undefined" ? process.cwd() : ".");
  // previous: const baseDir = logsDir || resolveDataDir(); — reverted in #555 for Workers compat
  const logDir = path.join(baseDir, "logs", `responses_${model}_${timestamp}_${uniqueId}`);

  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch {
    return null;
  }

  let inputEvents = [];
  let outputEvents = [];

  return {
    logInput: (event) => {
      inputEvents.push(event);
    },
    logOutput: (event) => {
      outputEvents.push(event);
    },
    flush: () => {
      try {
        fs.writeFileSync(path.join(logDir, "1_input_stream.txt"), inputEvents.join("\n"));
        fs.writeFileSync(path.join(logDir, "2_output_stream.txt"), outputEvents.join("\n"));
      } catch (_e) {
        console.log("[RESPONSES] Failed to write logs:", (_e as Error).message);
      }
    },
  };
}

type ResponsesTransformOptions = {
  heartbeatIntervalMs?: number;
};

/**
 * Create TransformStream that converts Chat Completions SSE to Responses API SSE
 * @param {Object} logger - Optional logger instance
 * @returns {TransformStream}
 */
export function createResponsesApiTransformStream(
  logger = null,
  options: ResponsesTransformOptions = {}
) {
  const heartbeatIntervalMs = Number.isFinite(options?.heartbeatIntervalMs)
    ? Math.max(0, Number(options.heartbeatIntervalMs))
    : 5000;
  const state = {
    seq: 0,
    responseId: `resp_${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    started: false,
    msgTextBuf: {},
    msgItemAdded: {},
    msgContentAdded: {},
    msgItemDone: {},
    msgOutputIndices: {},
    reasoningId: "",
    reasoningIndex: -1,
    reasoningBuf: "",
    reasoningPartAdded: false,
    reasoningDone: false,
    inThinking: false,
    funcArgsBuf: {},
    funcNames: {},
    funcCallIds: {},
    funcArgsDone: {},
    funcItemDone: {},
    funcOutputIndices: {},
    outputIndexMap: {},
    nextOutputIndex: 0,
    buffer: "",
    completedSent: false,
    usage: null,
  };

  // Per-stream instances to avoid shared state with concurrent streams
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const nextSeq = () => ++state.seq;
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

  const clearHeartbeat = () => {
    if (heartbeatTimer) {
      clearTimeout(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const scheduleHeartbeat = (controller) => {
    clearHeartbeat();
    if (!(heartbeatIntervalMs > 0) || state.completedSent) {
      return;
    }

    heartbeatTimer = setTimeout(() => {
      heartbeatTimer = null;
      if (state.completedSent) {
        return;
      }

      const output = ": keep-alive\n\n";
      try {
        logger?.logOutput(output.trim());
        controller.enqueue(encoder.encode(output));
      } catch {
        // Stream was cancelled or errored between ticks; stop rescheduling.
        return;
      }
      scheduleHeartbeat(controller);
    }, heartbeatIntervalMs);
    heartbeatTimer?.unref?.();
  };

  const emit = (controller, eventType, data) => {
    data.sequence_number = nextSeq();
    const output = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    logger?.logOutput(output.trim());
    controller.enqueue(encoder.encode(output));
    scheduleHeartbeat(controller);
  };

  const getOutputIndex = (key: string): number => {
    if (state.outputIndexMap[key] !== undefined) {
      return state.outputIndexMap[key];
    }
    const next = state.nextOutputIndex;
    state.outputIndexMap[key] = next;
    state.nextOutputIndex = next + 1;
    return next;
  };

  // Helper to start reasoning
  const startReasoning = (controller, idx) => {
    if (!state.reasoningId) {
      state.reasoningId = `rs_${state.responseId}_${idx}`;
      state.reasoningIndex = getOutputIndex("reasoning");

      emit(controller, "response.output_item.added", {
        type: "response.output_item.added",
        output_index: state.reasoningIndex,
        item: {
          id: state.reasoningId,
          type: "reasoning",
          summary: [],
        },
      });

      emit(controller, "response.reasoning_summary_part.added", {
        type: "response.reasoning_summary_part.added",
        item_id: state.reasoningId,
        output_index: state.reasoningIndex,
        summary_index: 0,
        part: { type: "summary_text", text: "" },
      });
      state.reasoningPartAdded = true;
    }
  };

  const emitReasoningDelta = (controller, text) => {
    if (!text) return;
    state.reasoningBuf += text;
    emit(controller, "response.reasoning_summary_text.delta", {
      type: "response.reasoning_summary_text.delta",
      item_id: state.reasoningId,
      output_index: state.reasoningIndex,
      summary_index: 0,
      delta: text,
    });
  };

  const closeReasoning = (controller) => {
    if (state.reasoningId && !state.reasoningDone) {
      state.reasoningDone = true;

      emit(controller, "response.reasoning_summary_text.done", {
        type: "response.reasoning_summary_text.done",
        item_id: state.reasoningId,
        output_index: state.reasoningIndex,
        summary_index: 0,
        text: state.reasoningBuf,
      });

      emit(controller, "response.reasoning_summary_part.done", {
        type: "response.reasoning_summary_part.done",
        item_id: state.reasoningId,
        output_index: state.reasoningIndex,
        summary_index: 0,
        part: { type: "summary_text", text: state.reasoningBuf },
      });

      emit(controller, "response.output_item.done", {
        type: "response.output_item.done",
        output_index: state.reasoningIndex,
        item: {
          id: state.reasoningId,
          type: "reasoning",
          summary: [{ type: "summary_text", text: state.reasoningBuf }],
        },
      });
    }
  };

  const closeMessage = (controller, idx) => {
    if (state.msgItemAdded[idx] && !state.msgItemDone[idx]) {
      state.msgItemDone[idx] = true;
      const fullText = state.msgTextBuf[idx] || "";
      const msgId = `msg_${state.responseId}_${idx}`;
      const outIdx = state.msgOutputIndices[idx] ?? getOutputIndex(`msg_${idx}`);

      emit(controller, "response.output_text.done", {
        type: "response.output_text.done",
        item_id: msgId,
        output_index: outIdx,
        content_index: 0,
        text: fullText,
        logprobs: [],
      });

      emit(controller, "response.content_part.done", {
        type: "response.content_part.done",
        item_id: msgId,
        output_index: outIdx,
        content_index: 0,
        part: { type: "output_text", annotations: [], logprobs: [], text: fullText },
      });

      emit(controller, "response.output_item.done", {
        type: "response.output_item.done",
        output_index: outIdx,
        item: {
          id: msgId,
          type: "message",
          content: [{ type: "output_text", annotations: [], logprobs: [], text: fullText }],
          role: "assistant",
        },
      });
    }
  };

  const closeToolCall = (controller, idx) => {
    const callId = state.funcCallIds[idx];
    if (callId && !state.funcItemDone[idx]) {
      const args = state.funcArgsBuf[idx] || "{}";
      const outIdx = state.funcOutputIndices[idx] ?? getOutputIndex(`func_${idx}`);

      emit(controller, "response.function_call_arguments.done", {
        type: "response.function_call_arguments.done",
        item_id: `fc_${callId}`,
        output_index: outIdx,
        arguments: args,
      });

      emit(controller, "response.output_item.done", {
        type: "response.output_item.done",
        output_index: outIdx,
        item: {
          id: `fc_${callId}`,
          type: "function_call",
          arguments: args,
          call_id: callId,
          name: state.funcNames[idx] || "",
        },
      });

      state.funcItemDone[idx] = true;
      state.funcArgsDone[idx] = true;
    }
  };

  const sendCompleted = (controller) => {
    if (!state.completedSent) {
      state.completedSent = true;
      clearHeartbeat();
      // Build output items ordered by their original output_index
      const outputItems: Array<{ index: number; item: Record<string, unknown> }> = [];
      if (state.reasoningId) {
        outputItems.push({
          index: state.reasoningIndex,
          item: {
            id: state.reasoningId,
            type: "reasoning",
            summary: [{ type: "summary_text", text: state.reasoningBuf }],
          },
        });
      }
      for (const idx in state.msgItemAdded) {
        const outIdx = state.msgOutputIndices[idx] ?? getOutputIndex(`msg_${idx}`);
        outputItems.push({
          index: outIdx,
          item: {
            id: `msg_${state.responseId}_${idx}`,
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", annotations: [], text: state.msgTextBuf[idx] || "" }],
          },
        });
      }
      for (const idx in state.funcCallIds) {
        const callId = state.funcCallIds[idx];
        const outIdx = state.funcOutputIndices[idx] ?? getOutputIndex(`func_${idx}`);
        outputItems.push({
          index: outIdx,
          item: {
            id: `fc_${callId}`,
            type: "function_call",
            call_id: callId,
            name: state.funcNames[idx] || "",
            arguments: state.funcArgsBuf[idx] || "{}",
          },
        });
      }

      outputItems.sort((a, b) => a.index - b.index);
      const output = outputItems.map((o) => o.item);

      const response: Record<string, unknown> = {
        id: state.responseId,
        object: "response",
        created_at: state.created,
        status: "completed",
        background: false,
        error: null,
        output,
      };

      if (state.model) {
        response.model = state.model;
      }

      if (state.usage) {
        const u = state.usage;
        const inTok = u.input_tokens ?? u.prompt_tokens ?? 0;
        const outTok = u.output_tokens ?? u.completion_tokens ?? 0;
        response.usage = {
          input_tokens: inTok,
          output_tokens: outTok,
          total_tokens: u.total_tokens ?? inTok + outTok,
          input_token_details: u.input_token_details ??
            u.prompt_tokens_details ?? { cached_tokens: 0 },
          output_token_details: u.output_token_details ??
            u.completion_tokens_details ?? { reasoning_tokens: 0 },
        };
      } else {
        const estimatedIn = 1000;
        const estimatedOut = Math.max(1, Math.ceil((state.accumulatedOutputLength || 0) / 3.5));
        response.usage = {
          input_tokens: estimatedIn,
          output_tokens: estimatedOut,
          total_tokens: estimatedIn + estimatedOut,
          input_token_details: { cached_tokens: 0 },
          output_token_details: { reasoning_tokens: 0 },
        };
      }
      emit(controller, "response.completed", {
        type: "response.completed",
        response,
      });
    }
  };

  // Emit assistant output_text for a message index, opening the item and
  // content part lazily on first text.
  const emitTextDelta = (controller, idx, content) => {
    if (!content) return;
    const outIdx = getOutputIndex(`msg_${idx}`);
    if (!state.msgItemAdded[idx]) {
      state.msgItemAdded[idx] = true;
      state.msgOutputIndices[idx] = outIdx;
      const msgId = `msg_${state.responseId}_${idx}`;

      emit(controller, "response.output_item.added", {
        type: "response.output_item.added",
        output_index: outIdx,
        item: { id: msgId, type: "message", content: [], role: "assistant" },
      });
    }

    if (!state.msgContentAdded[idx]) {
      state.msgContentAdded[idx] = true;

      emit(controller, "response.content_part.added", {
        type: "response.content_part.added",
        item_id: `msg_${state.responseId}_${idx}`,
        output_index: outIdx,
        content_index: 0,
        part: { type: "output_text", annotations: [], logprobs: [], text: "" },
      });
    }

    emit(controller, "response.output_text.delta", {
      type: "response.output_text.delta",
      item_id: `msg_${state.responseId}_${idx}`,
      output_index: outIdx,
      content_index: 0,
      delta: content,
      logprobs: [],
    });

    if (!state.msgTextBuf[idx]) state.msgTextBuf[idx] = "";
    state.msgTextBuf[idx] += content;
  };

  // The literal below carries the web-standard cancel() hook, which the bundled
  // lib.dom Transformer dictionary does not declare yet — hence the assertion.
  return new TransformStream({
    start(controller) {
      scheduleHeartbeat(controller);
    },
    cancel() {
      clearHeartbeat();
    },

    transform(chunk, controller) {
      const text = decoder.decode(chunk, { stream: true });
      logger?.logInput(text.trim());
      state.buffer += text;
      scheduleHeartbeat(controller);

      const messages = state.buffer.split("\n\n");
      state.buffer = messages.pop() || "";

      for (const msg of messages) {
        if (!msg.trim()) continue;

        const dataMatch = msg.match(/^data:\s*(.+)$/m);
        if (!dataMatch) continue;

        const dataStr = dataMatch[1].trim();
        if (dataStr === "[DONE]") continue;

        let parsed;
        try {
          parsed = JSON.parse(dataStr);
        } catch {
          continue;
        }

        if (!parsed.choices?.length) {
          if (parsed.usage) {
            state.usage = parsed.usage;
          }
          continue;
        }

        const choice = parsed.choices[0];
        const idx = choice.index || 0;
        const delta = choice.delta || {};

        // Emit initial events
        if (!state.started) {
          state.started = true;
          state.responseId = parsed.id ? `resp_${parsed.id}` : state.responseId;

          emit(controller, "response.created", {
            type: "response.created",
            response: {
              id: state.responseId,
              object: "response",
              created_at: state.created,
              status: "in_progress",
              background: false,
              error: null,
              output: [],
            },
          });

          emit(controller, "response.in_progress", {
            type: "response.in_progress",
            response: {
              id: state.responseId,
              object: "response",
              created_at: state.created,
              status: "in_progress",
            },
          });
        }

        // Handle reasoning_content (OpenAI native format)
        if (delta.reasoning_content) {
          startReasoning(controller, idx);
          emitReasoningDelta(controller, delta.reasoning_content);
        }

        // Handle text content. <think> spans are routed to reasoning by the
        // stateful splitter: partial markers are buffered across chunks, and a
        // literal "<think>" in prose (or an unterminated span) survives verbatim.
        if (delta.content) {
          const split = consumeThinkContent(state, delta.content);
          if (split.reasoning) {
            startReasoning(controller, idx);
            emitReasoningDelta(controller, split.reasoning);
          }
          if (split.text) {
            if (state.reasoningId && !state.reasoningDone) {
              closeReasoning(controller);
            }
            emitTextDelta(controller, idx, split.text);
          }
        }

        // Handle tool_calls
        if (delta.tool_calls) {
          if (state.reasoningId && !state.reasoningDone) {
            closeReasoning(controller);
          }
          closeMessage(controller, idx);

          for (const tc of delta.tool_calls) {
            const tcIdx = tc.index ?? 0;
            const newCallId = tc.id;
            const funcName = tc.function?.name;

            const outIdx =
              state.funcOutputIndices[tcIdx] !== undefined
                ? state.funcOutputIndices[tcIdx]
                : getOutputIndex(`func_${tcIdx}`);
            state.funcOutputIndices[tcIdx] = outIdx;

            // T37: Prevent merging if a new tool_call uses the same index
            if (state.funcCallIds[tcIdx] && newCallId && state.funcCallIds[tcIdx] !== newCallId) {
              closeToolCall(controller, tcIdx);
              delete state.funcCallIds[tcIdx];
              delete state.funcNames[tcIdx];
              delete state.funcArgsBuf[tcIdx];
              delete state.funcArgsDone[tcIdx];
              delete state.funcItemDone[tcIdx];
              const freshOutIdx = getOutputIndex(`func_${tcIdx}_${newCallId}`);
              state.funcOutputIndices[tcIdx] = freshOutIdx;
            }

            if (funcName) state.funcNames[tcIdx] = funcName;

            if (!state.funcCallIds[tcIdx]) {
              const callId = newCallId || `call_${Date.now().toString(36)}_${tcIdx}`;
              state.funcCallIds[tcIdx] = callId;
              const currentOutIdx = state.funcOutputIndices[tcIdx] ?? outIdx;

              emit(controller, "response.output_item.added", {
                type: "response.output_item.added",
                output_index: currentOutIdx,
                item: {
                  id: `fc_${callId}`,
                  type: "function_call",
                  arguments: "",
                  call_id: callId,
                  name: state.funcNames[tcIdx] || funcName || "",
                },
              });
            }

            if (!state.funcArgsBuf[tcIdx]) state.funcArgsBuf[tcIdx] = "";

            if (tc.function?.arguments) {
              const refCallId = state.funcCallIds[tcIdx] || newCallId;
              const currentOutIdx = state.funcOutputIndices[tcIdx] ?? outIdx;
              if (refCallId) {
                emit(controller, "response.function_call_arguments.delta", {
                  type: "response.function_call_arguments.delta",
                  item_id: `fc_${refCallId}`,
                  output_index: currentOutIdx,
                  delta: tc.function.arguments,
                });
              }
              state.funcArgsBuf[tcIdx] += tc.function.arguments;
            }
          }
        }

        // Handle finish_reason
        if (choice.finish_reason) {
          for (const i in state.msgItemAdded) closeMessage(controller, i);
          closeReasoning(controller);
          for (const i in state.funcCallIds) closeToolCall(controller, i);
          sendCompleted(controller);
        }
      }
    },

    flush(controller) {
      clearHeartbeat();
      state.buffer += decoder.decode();
      // Bytes the <think> splitter still held were never part of a closed
      // span — restore them verbatim as output text before closing.
      const heldThinkText = flushThinkContent(state);
      if (heldThinkText) emitTextDelta(controller, 0, heldThinkText);
      for (const i in state.msgItemAdded) closeMessage(controller, i);
      closeReasoning(controller);
      for (const i in state.funcCallIds) closeToolCall(controller, i);
      sendCompleted(controller);

      logger?.logOutput("data: [DONE]");
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      logger?.flush();
    },
  } as unknown as Transformer<Uint8Array, Uint8Array>);
}
