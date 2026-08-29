import { CORS_ORIGIN } from "@/shared/utils/cors";
import { handleChat } from "@/sse/handlers/chat";
import { initTranslators } from "@routiform/open-sse/translator/index.ts";
import { transformToOllamaGenerate } from "@routiform/open-sse/utils/ollamaTransform.ts";

let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await initTranslators();
    initialized = true;
    console.log("[SSE] Translators initialized");
  }
}

const OLLAMA_CORS_HEADERS = {
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export async function OPTIONS() {
  return new Response(null, {
    headers: OLLAMA_CORS_HEADERS,
  });
}

export async function POST(request: Request) {
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

  const options = (body.options as Record<string, unknown>) || {};
  const messages: Array<{ role: string; content: unknown }> = [];

  // Add system message if provided
  if (typeof body.system === "string" && body.system.trim()) {
    messages.push({ role: "system", content: body.system });
  }

  // Handle prompt and images
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const images = Array.isArray(body.images) ? body.images : [];

  if (images.length > 0) {
    const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
    if (prompt) {
      contentParts.push({ type: "text", text: prompt });
    }
    for (const img of images) {
      if (typeof img === "string") {
        const url = img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`;
        contentParts.push({ type: "image_url", image_url: { url } });
      }
    }
    messages.push({ role: "user", content: contentParts });
  } else {
    messages.push({ role: "user", content: prompt });
  }

  const openAiBody: Record<string, unknown> = {
    model: modelName,
    messages,
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
  return transformToOllamaGenerate(response, modelName, isStream);
}
