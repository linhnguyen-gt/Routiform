import { CORS_HEADERS } from "@/shared/utils/cors";
import { getDynamicOllamaModels } from "@/lib/ollama/models";

export async function OPTIONS() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function GET() {
  const modelsData = await getDynamicOllamaModels();
  return new Response(JSON.stringify(modelsData), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
