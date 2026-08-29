import { CORS_ORIGIN } from "@/shared/utils/cors";
import { handleChat } from "@/sse/handlers/chat";
import { initTranslators } from "@routiform/open-sse/translator/index.ts";
import { transformToOllama } from "@routiform/open-sse/utils/ollamaTransform.ts";

let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await initTranslators();
    initialized = true;
    console.log("[SSE] Translators initialized");
  }
}

export const OLLAMA_CORS_HEADERS = {
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

/**
 * Handle Ollama /api/chat POST requests
 */
export async function handleOllamaChatRequest(request: Request): Promise<Response> {
  await ensureInitialized();

  let body: Record<string, unknown> = {};
  let modelName = "llama3.2";
  let isStream = true;

  try {
    const rawBody = await request.clone().text();
    if (rawBody.trim()) {
      body = JSON.parse(rawBody);
      if (typeof body.model === "string") {
        modelName = body.model;
      }
      if (body.stream === false) {
        isStream = false;
      }
    }
  } catch {
    // If not JSON, handleChat will return BAD_REQUEST
  }

  // Convert Ollama options to standard OpenAI parameters if provided
  const options = (body.options as Record<string, unknown>) || {};
  const messages = Array.isArray(body.messages) ? body.messages : [];

  // Convert images in messages (Ollama allows images array on message object)
  const convertedMessages = messages.map((msg: Record<string, unknown>) => {
    if (Array.isArray(msg.images) && msg.images.length > 0) {
      const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
      if (typeof msg.content === "string" && msg.content) {
        contentParts.push({ type: "text", text: msg.content });
      }
      for (const img of msg.images) {
        if (typeof img === "string") {
          const url = img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`;
          contentParts.push({ type: "image_url", image_url: { url } });
        }
      }
      return {
        ...msg,
        content: contentParts,
      };
    }
    return msg;
  });

  const openAiBody: Record<string, unknown> = {
    ...body,
    model: modelName,
    messages: convertedMessages,
    stream: isStream,
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options.top_p !== undefined ? { top_p: options.top_p } : {}),
    ...(options.stop !== undefined ? { stop: options.stop } : {}),
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
    ...(options.num_predict !== undefined ? { max_tokens: options.num_predict } : {}),
  };

  // Convert format
  if (body.format === "json") {
    openAiBody.response_format = { type: "json_object" };
  } else if (typeof body.format === "object" && body.format !== null) {
    openAiBody.response_format = {
      type: "json_schema",
      json_schema: { schema: body.format },
    };
  }

  const translatedRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(openAiBody),
  });

  const response = await handleChat(translatedRequest);
  return transformToOllama(response, modelName, isStream);
}
