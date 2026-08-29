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
  const input = body.input !== undefined ? body.input : "";

  if (!model) {
    return new Response(JSON.stringify({ error: "model is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...OLLAMA_CORS_HEADERS },
    });
  }

  // Synthesize standard OpenAI embedding request
  const openAiPayload: Record<string, unknown> = {
    model,
    input,
    ...(body.dimensions !== undefined ? { dimensions: body.dimensions } : {}),
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
    const embeddingsList: number[][] = Array.isArray(data.data)
      ? data.data.map((item: { embedding?: number[] }) => item.embedding || [])
      : [];

    const ollamaResponse = {
      model,
      embeddings: embeddingsList,
      total_duration: 100000000,
      load_duration: 1000000,
      prompt_eval_count: data.usage?.prompt_tokens || 0,
    };

    return new Response(JSON.stringify(ollamaResponse), {
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
