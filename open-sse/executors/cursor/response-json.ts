import { HTTP_STATUS } from "../../config/constants.ts";
import { extractTextFromResponse } from "../../utils/cursorProtobuf.ts";
import { estimateUsage } from "../../utils/usageTracking.ts";
import { FORMATS } from "../../translator/formats.ts";
import { decompressPayload, createErrorResponse } from "./errors.ts";
import { debugLog } from "./shared.ts";

export function transformProtobufToJSON(buffer, model, body) {
  const responseId = `chatcmpl-cursor-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  let offset = 0;
  let totalContent = "";
  const toolCalls = [];
  const toolCallsMap = new Map(); // Track streaming tool calls by ID
  const finalizedIds = new Set<string>();
  let frameCount = 0;

  debugLog(`[CURSOR BUFFER] Total length: ${buffer.length} bytes`);

  while (offset < buffer.length) {
    if (offset + 5 > buffer.length) {
      debugLog(
        `[CURSOR BUFFER] Reached end, offset=${offset}, remaining=${buffer.length - offset}`
      );
      break;
    }

    const flags = buffer[offset];
    const length = buffer.readUInt32BE(offset + 1);

    debugLog(
      `[CURSOR BUFFER] Frame ${frameCount + 1}: flags=0x${flags.toString(16).padStart(2, "0")}, length=${length}`
    );

    if (offset + 5 + length > buffer.length) {
      debugLog(
        `[CURSOR BUFFER] Incomplete frame, offset=${offset}, length=${length}, buffer.length=${buffer.length}`
      );
      break;
    }

    let payload = buffer.slice(offset + 5, offset + 5 + length);
    offset += 5 + length;
    frameCount++;

    payload = decompressPayload(payload, flags);
    if (!payload) {
      debugLog(`[CURSOR BUFFER] Frame ${frameCount}: decompression failed, skipping`);
      continue;
    }

    // Check for JSON error frames (byte guard: skip toString on non-JSON frames)
    if (payload.length > 0 && payload[0] === 0x7b) {
      try {
        const text = payload.toString("utf-8");
        if (text.includes('"error"')) {
          const hasContent = totalContent || toolCallsMap.size > 0;
          debugLog(`[CURSOR BUFFER] Error frame (hasContent=${hasContent}): ${text.slice(0, 500)}`);
          if (hasContent) {
            break;
          }
          return createErrorResponse(JSON.parse(text));
        }
      } catch {}
    }

    const result = extractTextFromResponse(new Uint8Array(payload));
    debugLog(`[CURSOR DECODED] Frame ${frameCount}:`, result);

    if (result.error) {
      const hasContent = totalContent || toolCallsMap.size > 0;
      debugLog(`[CURSOR BUFFER] Decoded error (hasContent=${hasContent}): ${result.error}`);
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

      if (toolCallsMap.has(tc.id)) {
        // Accumulate arguments for existing tool call
        const existing = toolCallsMap.get(tc.id);
        existing.function.arguments += tc.function.arguments;
        existing.isLast = tc.isLast;
      } else {
        // New tool call
        toolCallsMap.set(tc.id, { ...tc });
      }

      // Push to final array when isLast is true
      if (tc.isLast) {
        const finalToolCall = toolCallsMap.get(tc.id);
        finalizedIds.add(tc.id);
        toolCalls.push({
          id: finalToolCall.id,
          type: finalToolCall.type,
          function: {
            name: finalToolCall.function.name,
            arguments: finalToolCall.function.arguments,
          },
        });
      }
    }

    if (result.text) totalContent += result.text;
  }

  debugLog(
    `[CURSOR BUFFER] Parsed ${frameCount} frames, toolCallsMap size: ${toolCallsMap.size}, finalized toolCalls: ${toolCalls.length}`
  );

  // Finalize all remaining tool calls in map (in case stream ended without isLast=true)
  for (const [id, tc] of toolCallsMap.entries()) {
    // Check if already in final array
    if (!finalizedIds.has(id)) {
      debugLog(`[CURSOR BUFFER] Finalizing incomplete tool call: ${id}, isLast=${tc.isLast}`);
      toolCalls.push({
        id: tc.id,
        type: tc.type,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      });
    }
  }

  debugLog(`[CURSOR BUFFER] Final toolCalls count: ${toolCalls.length}`);

  const message: Record<string, unknown> = {
    role: "assistant",
    content: totalContent || null,
  };

  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }

  const usage = estimateUsage(body, totalContent.length, FORMATS.OPENAI);

  const completion = {
    id: responseId,
    object: "chat.completion",
    created,
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
      },
    ],
    usage,
  };

  return new Response(JSON.stringify(completion), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
