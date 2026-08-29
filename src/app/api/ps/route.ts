import { CORS_ORIGIN } from "@/shared/utils/cors";

const OLLAMA_CORS_HEADERS = {
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export async function OPTIONS() {
  return new Response(null, {
    headers: OLLAMA_CORS_HEADERS,
  });
}

export async function GET() {
  return new Response(JSON.stringify({ models: [] }), {
    headers: {
      "Content-Type": "application/json",
      ...OLLAMA_CORS_HEADERS,
    },
  });
}
