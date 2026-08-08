import { CORS_ORIGIN } from "@/shared/utils/cors";
import { PROVIDER_MODELS } from "@/shared/constants/models";
import { getAllCustomModels } from "@/lib/db/models";
import { getProviderConnections } from "@/lib/localDb";
import { loadAntigravityModelsFromConnections } from "@/lib/providers/antigravityLiveModels";
import { REGISTRY } from "@routiform/open-sse/config/providerRegistry.ts";

/**
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": CORS_ORIGIN,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

/**
 * GET /v1beta/models - Gemini compatible models list
 * Returns models in Gemini API format with real token limits when available.
 */
export async function GET() {
  try {
    const models = [];

    // Built-in models (hardcoded defaults)
    for (const [provider, providerModels] of Object.entries(PROVIDER_MODELS)) {
      if (provider === "antigravity") continue;
      const registryEntry = REGISTRY[provider];
      const defaultContextLength = registryEntry?.defaultContextLength;
      const defaultOutputTokenLimit = registryEntry?.defaultMaxOutputTokens;

      for (const model of providerModels) {
        models.push({
          name: `models/${provider}/${model.id}`,
          displayName: model.name || model.id,
          description: `${provider} model: ${model.name || model.id}`,
          supportedGenerationMethods: ["generateContent"],
          inputTokenLimit:
            typeof model.contextLength === "number"
              ? model.contextLength
              : typeof defaultContextLength === "number"
                ? defaultContextLength
                : 128000,
          outputTokenLimit:
            typeof model.maxOutputTokens === "number"
              ? model.maxOutputTokens
              : typeof defaultOutputTokenLimit === "number"
                ? defaultOutputTokenLimit
                : 8192,
        });
      }
    }

    try {
      const connections = await getProviderConnections();
      const antigravityModels = await loadAntigravityModelsFromConnections(
        connections as Array<Record<string, unknown>>
      );
      const registryEntry = REGISTRY.antigravity;
      const defaultContextLength = registryEntry?.defaultContextLength;
      const defaultOutputTokenLimit = registryEntry?.defaultMaxOutputTokens;

      for (const model of antigravityModels) {
        models.push({
          name: `models/antigravity/${model.id}`,
          displayName: model.name || model.id,
          description: `antigravity model: ${model.name || model.id}`,
          supportedGenerationMethods: ["generateContent"],
          inputTokenLimit: typeof defaultContextLength === "number" ? defaultContextLength : 128000,
          outputTokenLimit:
            typeof defaultOutputTokenLimit === "number" ? defaultOutputTokenLimit : 8192,
        });
      }
    } catch {
      // Antigravity catalog is live-only; omit stale fallback entries on failure.
    }

    // Custom models (use stored metadata from provider APIs)
    try {
      const customModelsMap = (await getAllCustomModels()) as Record<string, unknown>;
      for (const [providerId, rawModels] of Object.entries(customModelsMap)) {
        if (!Array.isArray(rawModels)) continue;
        for (const model of rawModels) {
          if (
            !model ||
            typeof model !== "object" ||
            typeof (model as Record<string, unknown>).id !== "string"
          )
            continue;
          const m = model as Record<string, unknown>;
          if (m.isHidden === true) continue;
          models.push({
            name: `models/${providerId}/${m.id}`,
            displayName: m.name || m.id,
            ...(typeof m.description === "string" ? { description: m.description } : {}),
            supportedGenerationMethods: ["generateContent"],
            inputTokenLimit: typeof m.inputTokenLimit === "number" ? m.inputTokenLimit : 128000,
            outputTokenLimit: typeof m.outputTokenLimit === "number" ? m.outputTokenLimit : 8192,
            ...(m.supportsThinking === true ? { thinking: true } : {}),
          });
        }
      }
    } catch {
      // Custom models are optional — skip on error
    }

    return Response.json({ models });
  } catch (error: unknown) {
    console.log("Error fetching models:", error);
    return Response.json(
      { error: { message: error instanceof Error ? error.message : String(error) } },
      { status: 500 }
    );
  }
}
