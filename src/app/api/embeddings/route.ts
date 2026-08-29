import { CORS_ORIGIN } from "@/shared/utils/cors";
import { POST as handleV1Embeddings } from "@/app/api/v1/embeddings/route";

const OLLAMA_CORS_HEADERS = {
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export async function OPTIONS() {
  return new Response(null, {
    headers: OLLAMA_CORS_HEADERS,
  });
}

/**
 * Legacy Ollama POST /api/embeddings
 * Receives: { model, prompt }
 * Returns: { embedding: number[] }
 */
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
  const input = typeof body.prompt === "string" ? body.prompt : body.input || "";

  if (!model) {
    return new Response(JSON.stringify({ error: "model is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...OLLAMA_CORS_HEADERS },
    });
  }

  const openAiPayload = {
    model,
    input,
  };

  const v1Request = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(openAiPayload),
  });

  const res = await handleV1Embeddings(v1Request);
  if (!res.ok) {
    return res;
  }

  try {
    const data = await res.json();
    const firstEmbedding: number[] = data.data?.[0]?.embedding || [];

    return new Response(JSON.stringify({ embedding: firstEmbedding }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...OLLAMA_CORS_HEADERS,
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Failed to parse embeddings response" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...OLLAMA_CORS_HEADERS },
    });
  }
}
