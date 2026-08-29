import { getCorsOrigin, CORS_HEADERS } from "./cors.ts";

type PendingToolCall = {
  id?: string;
  function: {
    name: string;
    arguments: string;
  };
};

/**
 * Helper to build common Ollama error response
 */
function buildOllamaErrorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

/**
 * Transform OpenAI response (stream or non-stream) to Ollama Chat format (/api/chat)
 */
export async function transformToOllama(
  response: Response,
  model: string,
  explicitStream?: boolean
): Promise<Response> {
  const isError = !response.ok;
  if (isError) {
    return response;
  }

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const isStream = explicitStream !== undefined ? explicitStream : !isJson;

  // Non-streaming response handling
  if (!isStream || isJson) {
    try {
      const parsed = await response.json();
      const choice = parsed.choices?.[0] || {};
      const msg = choice.message || {};
      const content = typeof msg.content === "string" ? msg.content : "";
      const thinking =
        typeof msg.reasoning_content === "string" && msg.reasoning_content.length > 0
          ? msg.reasoning_content
          : undefined;

      const formattedToolCalls = Array.isArray(msg.tool_calls)
        ? msg.tool_calls.map((tc: { function?: { name?: string; arguments?: string } }) => ({
            function: {
              name: tc.function?.name || "",
              arguments:
                typeof tc.function?.arguments === "string"
                  ? JSON.parse(tc.function.arguments || "{}")
                  : tc.function?.arguments || {},
            },
          }))
        : undefined;

      const ollamaChatResponse = {
        model,
        created_at: new Date().toISOString(),
        message: {
          role: "assistant",
          content,
          ...(thinking !== undefined ? { thinking } : {}),
          ...(formattedToolCalls ? { tool_calls: formattedToolCalls } : {}),
        },
        done: true,
        done_reason: choice.finish_reason || "stop",
        total_duration: 100000000,
        load_duration: 1000000,
        prompt_eval_count: parsed.usage?.prompt_tokens || 0,
        eval_count: parsed.usage?.completion_tokens || 0,
      };

      return new Response(JSON.stringify(ollamaChatResponse), {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": getCorsOrigin(),
        },
      });
    } catch {
      return buildOllamaErrorResponse(500, "Failed to parse chat completion response");
    }
  }

  // Streaming SSE response handling -> application/x-ndjson
  let buffer = "";
  let pendingToolCalls: Record<number, PendingToolCall> = {};
  const completedToolCalls: PendingToolCall[] = [];

  const transform = new TransformStream({
    transform(chunk, controller) {
      const text = new TextDecoder().decode(chunk);
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();

        if (data === "[DONE]") {
          const ollamaEnd =
            JSON.stringify({
              model,
              created_at: new Date().toISOString(),
              message: { role: "assistant", content: "" },
              done: true,
              done_reason: "stop",
            }) + "\n";
          controller.enqueue(new TextEncoder().encode(ollamaEnd));
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta || {};
          const content = typeof delta.content === "string" ? delta.content : "";
          const thinking =
            typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0
              ? delta.reasoning_content
              : undefined;
          const toolCalls = delta.tool_calls;

          if (toolCalls) {
            for (const tc of toolCalls) {
              const idx = tc.index ?? 0;

              // T37: Prevent merging tool_calls on same index if ID changes
              if (pendingToolCalls[idx] && tc.id && pendingToolCalls[idx].id !== tc.id) {
                completedToolCalls.push(pendingToolCalls[idx]);
                delete pendingToolCalls[idx];
              }

              if (!pendingToolCalls[idx]) {
                pendingToolCalls[idx] = { id: tc.id, function: { name: "", arguments: "" } };
              }
              if (tc.function?.name) pendingToolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments)
                pendingToolCalls[idx].function.arguments += tc.function.arguments;
            }
          }

          if (content || thinking !== undefined) {
            const ollama =
              JSON.stringify({
                model,
                created_at: new Date().toISOString(),
                message: {
                  role: "assistant",
                  content,
                  ...(thinking !== undefined ? { thinking } : {}),
                },
                done: false,
              }) + "\n";
            controller.enqueue(new TextEncoder().encode(ollama));
          }

          const finishReason = parsed.choices?.[0]?.finish_reason;
          if (finishReason === "tool_calls" || finishReason === "stop") {
            const toolCallsArr = [...completedToolCalls, ...Object.values(pendingToolCalls)];
            if (toolCallsArr.length > 0) {
              const formattedCalls = toolCallsArr.map((tc) => ({
                function: {
                  name: tc.function.name,
                  arguments: JSON.parse(tc.function.arguments || "{}"),
                },
              }));
              const ollama =
                JSON.stringify({
                  model,
                  created_at: new Date().toISOString(),
                  message: { role: "assistant", content: "", tool_calls: formattedCalls },
                  done: true,
                  done_reason: finishReason,
                }) + "\n";
              controller.enqueue(new TextEncoder().encode(ollama));
              pendingToolCalls = {};
            } else if (finishReason === "stop") {
              const ollamaEnd =
                JSON.stringify({
                  model,
                  created_at: new Date().toISOString(),
                  message: { role: "assistant", content: "" },
                  done: true,
                  done_reason: "stop",
                }) + "\n";
              controller.enqueue(new TextEncoder().encode(ollamaEnd));
            }
          }
        } catch {
          // Silently ignore parse errors
        }
      }
    },
    flush(controller) {
      if (buffer.trim()) {
        console.warn(
          `[ollamaTransform] Stream ended with unparsed buffer (${buffer.length} chars):`,
          buffer.slice(0, 200)
        );
      }
      const ollamaEnd =
        JSON.stringify({
          model,
          created_at: new Date().toISOString(),
          message: { role: "assistant", content: "" },
          done: true,
          done_reason: "stop",
        }) + "\n";
      controller.enqueue(new TextEncoder().encode(ollamaEnd));
    },
  });

  if (!response.body) {
    return buildOllamaErrorResponse(500, "Empty upstream response body");
  }

  return new Response(response.body.pipeThrough(transform), {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Access-Control-Allow-Origin": getCorsOrigin(),
    },
  });
}

/**
 * Transform OpenAI response (stream or non-stream) to Ollama Generate format (/api/generate)
 */
export async function transformToOllamaGenerate(
  response: Response,
  model: string,
  explicitStream?: boolean
): Promise<Response> {
  const isError = !response.ok;
  if (isError) {
    return response;
  }

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const isStream = explicitStream !== undefined ? explicitStream : !isJson;

  // Non-streaming generate response
  if (!isStream || isJson) {
    try {
      const parsed = await response.json();
      const choice = parsed.choices?.[0] || {};
      const msg = choice.message || {};
      const content = typeof msg.content === "string" ? msg.content : "";
      const thinking =
        typeof msg.reasoning_content === "string" && msg.reasoning_content.length > 0
          ? msg.reasoning_content
          : undefined;

      const ollamaGenResponse = {
        model,
        created_at: new Date().toISOString(),
        response: content,
        ...(thinking !== undefined ? { thinking } : {}),
        done: true,
        done_reason: choice.finish_reason || "stop",
        total_duration: 100000000,
        load_duration: 1000000,
        prompt_eval_count: parsed.usage?.prompt_tokens || 0,
        eval_count: parsed.usage?.completion_tokens || 0,
      };

      return new Response(JSON.stringify(ollamaGenResponse), {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": getCorsOrigin(),
        },
      });
    } catch {
      return buildOllamaErrorResponse(500, "Failed to parse generate completion response");
    }
  }

  // Streaming generate response -> application/x-ndjson
  let buffer = "";

  const transform = new TransformStream({
    transform(chunk, controller) {
      const text = new TextDecoder().decode(chunk);
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();

        if (data === "[DONE]") {
          const ollamaEnd =
            JSON.stringify({
              model,
              created_at: new Date().toISOString(),
              response: "",
              done: true,
              done_reason: "stop",
            }) + "\n";
          controller.enqueue(new TextEncoder().encode(ollamaEnd));
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta || {};
          const content = typeof delta.content === "string" ? delta.content : "";
          const thinking =
            typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0
              ? delta.reasoning_content
              : undefined;

          if (content || thinking !== undefined) {
            const ollama =
              JSON.stringify({
                model,
                created_at: new Date().toISOString(),
                response: content,
                ...(thinking !== undefined ? { thinking } : {}),
                done: false,
              }) + "\n";
            controller.enqueue(new TextEncoder().encode(ollama));
          }

          const finishReason = parsed.choices?.[0]?.finish_reason;
          if (finishReason === "stop" || finishReason === "length") {
            const ollamaEnd =
              JSON.stringify({
                model,
                created_at: new Date().toISOString(),
                response: "",
                done: true,
                done_reason: finishReason,
              }) + "\n";
            controller.enqueue(new TextEncoder().encode(ollamaEnd));
          }
        } catch {
          // Silently ignore parse errors
        }
      }
    },
    flush(controller) {
      if (buffer.trim()) {
        console.warn(
          `[ollamaTransform] Generate stream ended with unparsed buffer (${buffer.length} chars):`,
          buffer.slice(0, 200)
        );
      }
      const ollamaEnd =
        JSON.stringify({
          model,
          created_at: new Date().toISOString(),
          response: "",
          done: true,
          done_reason: "stop",
        }) + "\n";
      controller.enqueue(new TextEncoder().encode(ollamaEnd));
    },
  });

  if (!response.body) {
    return buildOllamaErrorResponse(500, "Empty upstream response body");
  }

  return new Response(response.body.pipeThrough(transform), {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Access-Control-Allow-Origin": getCorsOrigin(),
    },
  });
}
