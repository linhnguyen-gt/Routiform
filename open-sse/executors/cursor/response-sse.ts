import { HTTP_STATUS } from "../../config/constants.ts";
import { extractTextFromResponse } from "../../utils/cursorProtobuf.ts";
import { estimateUsage } from "../../utils/usageTracking.ts";
import { FORMATS } from "../../translator/formats.ts";
import { decompressPayload, createErrorResponse } from "./errors.ts";
import { debugLog } from "./shared.ts";

export function transformProtobufToSSE(buffer, model, body) {
  const responseId = `chatcmpl-cursor-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  const chunks = [];
  let offset = 0;
  let totalContent = "";
  const toolCalls = [];
  const toolCallsMap = new Map(); // Track streaming tool calls by ID
  const finalizedIds = new Set<string>();
  const emittedToolCallIds = new Set<string>();
  let frameCount = 0;

  debugLog(`[CURSOR BUFFER SSE] Total length: ${buffer.length} bytes`);

  while (offset < buffer.length) {
    if (offset + 5 > buffer.length) {
      debugLog(
        `[CURSOR BUFFER SSE] Reached end, offset=${offset}, remaining=${buffer.length - offset}`
      );
      break;
    }

    const flags = buffer[offset];
    const length = buffer.readUInt32BE(offset + 1);

    debugLog(
      `[CURSOR BUFFER SSE] Frame ${frameCount + 1}: flags=0x${flags.toString(16).padStart(2, "0")}, length=${length}`
    );

    if (offset + 5 + length > buffer.length) {
      debugLog(
        `[CURSOR BUFFER SSE] Incomplete frame, offset=${offset}, length=${length}, buffer.length=${buffer.length}`
      );
      break;
    }

    let payload = buffer.slice(offset + 5, offset + 5 + length);
    offset += 5 + length;
    frameCount++;

    payload = decompressPayload(payload, flags);
    if (!payload) {
      debugLog(`[CURSOR BUFFER SSE] Frame ${frameCount}: decompression failed, skipping`);
      continue;
    }

    // Check for JSON error frames (byte-guard: only decode if starts with '{')
    if (payload[0] === 0x7b) {
      try {
        const text = payload.toString("utf-8");
        if (text.includes('"error"')) {
          const hasContent = chunks.length > 0 || totalContent || toolCallsMap.size > 0;
          debugLog(
            `[CURSOR BUFFER SSE] Error frame (hasContent=${hasContent}): ${text.slice(0, 500)}`
          );
          if (hasContent) {
            break;
          }
          return createErrorResponse(JSON.parse(text));
        }
      } catch {}
    }

    const result = extractTextFromResponse(new Uint8Array(payload));
    debugLog(`[CURSOR DECODED SSE] Frame ${frameCount}:`, result);

    if (result.error) {
      const hasContent = chunks.length > 0 || totalContent || toolCallsMap.size > 0;
      debugLog(`[CURSOR BUFFER SSE] Decoded error (hasContent=${hasContent}): ${result.error}`);
      // If we already have content, treat error as stream termination
      if (hasContent) {
        break;
      }
      return new Response(
        JSON.stringify({
          error: {
            message: result.error,
            type: "rate_limit_error",
            code: "rate_limited",
          },
        }),
        {
          status: HTTP_STATUS.RATE_LIMITED,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (result.toolCall) {
      const tc = result.toolCall;

      if (chunks.length === 0) {
        chunks.push(
          `data: ${JSON.stringify({
            id: responseId,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [
              {
                index: 0,
                delta: { role: "assistant", content: "" },
                finish_reason: null,
              },
            ],
          })}\n\n`
        );
      }

      if (toolCallsMap.has(tc.id)) {
        // Accumulate arguments for existing tool call
        const existing = toolCallsMap.get(tc.id);
        const _oldArgsLen = existing.function.arguments.length;
        existing.function.arguments += tc.function.arguments;
        existing.isLast = tc.isLast;

        // Stream the delta arguments
        if (tc.function.arguments) {
          emittedToolCallIds.add(tc.id);
          chunks.push(
            `data: ${JSON.stringify({
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
                        index: existing.index,
                        id: tc.id,
                        type: "function",
                        function: {
                          name: tc.function.name,
                          arguments: tc.function.arguments,
                        },
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            })}\n\n`
          );
        }
      } else {
        // New tool call - assign index and add to map
        const toolCallIndex = toolCalls.length;
        finalizedIds.add(tc.id);
        toolCalls.push({ ...tc, index: toolCallIndex });
        toolCallsMap.set(tc.id, { ...tc, index: toolCallIndex });

        // Stream initial tool call with name
        emittedToolCallIds.add(tc.id);
        chunks.push(
          `data: ${JSON.stringify({
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
                      index: toolCallIndex,
                      id: tc.id,
                      type: "function",
                      function: {
                        name: tc.function.name,
                        arguments: tc.function.arguments,
                      },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          })}\n\n`
        );
      }
    }

    if (result.text) {
      totalContent += result.text;
      chunks.push(
        `data: ${JSON.stringify({
          id: responseId,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [
            {
              index: 0,
              delta:
                chunks.length === 0 && toolCalls.length === 0
                  ? { role: "assistant", content: result.text }
                  : { content: result.text },
              finish_reason: null,
            },
          ],
        })}\n\n`
      );
    }
  }

  debugLog(
    `[CURSOR BUFFER SSE] Parsed ${frameCount} frames, toolCallsMap size: ${toolCallsMap.size}, toolCalls array: ${toolCalls.length}`
  );

  // Finalize all remaining tool calls in map (stream may have ended without isLast=true)
  for (const [id, tc] of toolCallsMap.entries()) {
    if (!finalizedIds.has(id)) {
      debugLog(`[CURSOR BUFFER SSE] Finalizing incomplete tool call: ${id}, isLast=${tc.isLast}`);
      const toolCallIndex = toolCalls.length;
      toolCalls.push({
        id: tc.id,
        type: tc.type,
        index: toolCallIndex,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      });

      // Emit SSE chunk for the finalized tool call if not already emitted
      if (!emittedToolCallIds.has(tc.id)) {
        chunks.push(
          `data: ${JSON.stringify({
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
                      index: toolCallIndex,
                      id: tc.id,
                      type: "function",
                      function: {
                        name: tc.function.name,
                        arguments: tc.function.arguments,
                      },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          })}\n\n`
        );
      }
    }
  }

  if (chunks.length === 0 && toolCalls.length === 0) {
    chunks.push(
      `data: ${JSON.stringify({
        id: responseId,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "" },
            finish_reason: null,
          },
        ],
      })}\n\n`
    );
  }

  const usage = estimateUsage(body, totalContent.length, FORMATS.OPENAI);

  chunks.push(
    `data: ${JSON.stringify({
      id: responseId,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
        },
      ],
      usage,
    })}\n\n`
  );
  chunks.push("data: [DONE]\n\n");

  return new Response(chunks.join(""), {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
