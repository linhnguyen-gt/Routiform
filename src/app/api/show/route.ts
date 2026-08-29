import { CORS_ORIGIN } from "@/shared/utils/cors";
import { getOllamaShowModelDetails } from "@/lib/ollama/models";

const OLLAMA_CORS_HEADERS = {
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export async function OPTIONS() {
  return new Response(null, {
    headers: OLLAMA_CORS_HEADERS,
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    const raw = await request.clone().text();
    if (raw.trim()) {
      body = JSON.parse(raw);
    }
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...OLLAMA_CORS_HEADERS },
    });
  }

  const model = typeof body.model === "string" ? body.model : "";
  if (!model) {
    return new Response(JSON.stringify({ error: "model is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...OLLAMA_CORS_HEADERS },
    });
  }

  const showDetails = getOllamaShowModelDetails(model);
  return new Response(JSON.stringify(showDetails), {
    headers: {
      "Content-Type": "application/json",
      ...OLLAMA_CORS_HEADERS,
    },
  });
}
