import { CORS_ORIGIN } from "@/shared/utils/cors";
import { PROVIDER_MODELS } from "@/shared/constants/models";
import { getAllCustomModels, getSyncedAvailableModels } from "@/lib/db/models";

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
      for (const model of providerModels) {
        models.push({
          name: `models/${provider}/${model.id}`,
          displayName: model.name || model.id,
          description: `${provider} model: ${model.name || model.id}`,
          supportedGenerationMethods: ["generateContent"],
          inputTokenLimit: 128000,
          outputTokenLimit: 8192,
        });
      }
    }

    // Gemini: always replace hardcoded entries with synced models (no fallback)
    // Always remove hardcoded gemini entries — even if sync returns empty
    for (let i = models.length - 1; i >= 0; i--) {
      if (typeof (models[i] as any).name === "string" && (models[i] as any).name.startsWith("models/gemini/")) {
        models.splice(i, 1);
      }
    }
    try {
      const syncedGeminiModels = await getSyncedAvailableModels("gemini");
      for (const m of syncedGeminiModels) {
        models.push({
          name: `models/gemini/${m.id}`,
          displayName: m.name || m.id,
          ...(typeof m.description === "string" ? { description: m.description } : {}),
          supportedGenerationMethods: ["generateContent"],
          inputTokenLimit: typeof m.inputTokenLimit === "number" ? m.inputTokenLimit : 128000,
          outputTokenLimit: typeof m.outputTokenLimit === "number" ? m.outputTokenLimit : 8192,
          ...(m.supportsThinking === true ? { thinking: true } : {}),
        });
      }
    } catch (err) {
      console.error("[v1beta/models] Error fetching synced Gemini models:", err);
    }

    // Custom models (use stored metadata from provider APIs)
    try {
      const customModelsMap = (await getAllCustomModels()) as Record<string, unknown>;
      for (const [providerId, rawModels] of Object.entries(customModelsMap)) {
        if (!Array.isArray(rawModels)) continue;
        // Skip Gemini — handled by syncedAvailableModels above
        if (providerId === "gemini") continue;
        for (const model of rawModels) {
          if (!model || typeof model !== "object" || typeof (model as any).id !== "string") continue;
          const m = model as Record<string, unknown>;
          if (m.isHidden === true) continue;
          models.push({
            name: `models/${providerId}/${m.id}`,
            displayName: m.name || m.id,
            ...(typeof m.description === "string" ? { description: m.description } : {}),
            supportedGenerationMethods: ["generateContent"],
            inputTokenLimit:
              typeof m.inputTokenLimit === "number" ? m.inputTokenLimit : 128000,
            outputTokenLimit:
              typeof m.outputTokenLimit === "number" ? m.outputTokenLimit : 8192,
            ...(m.supportsThinking === true ? { thinking: true } : {}),
          });
        }
      }
    } catch {
      // Custom models are optional — skip on error
    }

    return Response.json({ models });
  } catch (error: any) {
    console.log("Error fetching models:", error);
    return Response.json({ error: { message: error.message } }, { status: 500 });
  }
}
