import { OLLAMA_CORS_HEADERS, handleOllamaChatRequest } from "@/lib/ollama/chatHandler";

export async function OPTIONS() {
  return new Response(null, {
    headers: OLLAMA_CORS_HEADERS,
  });
}

export async function POST(request: Request) {
  return handleOllamaChatRequest(request);
}
