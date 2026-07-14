import { NextResponse } from "next/server";
import { getModelAliases, setModelAlias, getProviderConnections } from "@/models";
import { getAllSyncedAvailableModels } from "@/lib/db/models";
import { AI_MODELS, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import { loadAntigravityModelsFromConnections } from "@/lib/providers/antigravityLiveModels";
import { updateModelAliasSchema } from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { modelSupportsImages } from "@/lib/chat/model-vision";

const LIVE_SYNC_MODEL_PROVIDERS = new Set(["claude", "gemini"]);

/**
 * One row of the catalog.
 *
 * Declared rather than inferred: the array is built from three sources (AI_MODELS, the live
 * Antigravity catalog, and synced provider models), and inferring its type from the first one
 * made pushing the others a type error.
 */
interface ModelListEntry {
  provider: string;
  model: string;
  fullModel: string;
  alias: unknown;
  available: boolean;
  /** Whether an image survives translation to this model's target format (lib/chat/model-vision). */
  supportsImages: boolean;
  name?: string;
  [key: string]: unknown;
}

// GET /api/models - Get models with aliases (only from active providers by default)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const showAll = searchParams.get("all") === "true";

    const modelAliases = await getModelAliases();
    const syncedModelsMap = await getAllSyncedAvailableModels().catch(() => ({}));
    let connections: Array<Record<string, unknown>> = [];

    // Get active provider connections to filter available models
    let activeProviders: Set<string> | null = null;
    try {
      connections = await getProviderConnections();
      if (!showAll) {
        const active = connections.filter((c: Record<string, unknown>) => c.isActive !== false);
        // Include both provider IDs and their aliases in the active set.
        // PROVIDER_MODELS keys are aliases (e.g. 'cc' for 'claude', 'gh' for 'github').
        // DB connections are stored under provider IDs ('claude', 'github').
        // Without this, models for aliased providers always appear unconfigured.
        activeProviders = new Set<string>();
        for (const c of active) {
          const pId = String((c as Record<string, unknown>).provider);
          activeProviders.add(pId);
          const alias = PROVIDER_ID_TO_ALIAS[pId];
          if (alias) activeProviders.add(alias);
        }
      }
    } catch {
      // If DB unavailable, show all models
    }

    const models: ModelListEntry[] = AI_MODELS.filter((m) => m.provider !== "antigravity")
      .map((m: { provider: string; model: string; [key: string]: unknown }): ModelListEntry => {
        const fullModel = `${m.provider}/${m.model}`;
        const available = !activeProviders || activeProviders.has(m.provider);
        return {
          ...m,
          fullModel,
          alias: modelAliases[fullModel] || m.model,
          available,
          supportsImages: modelSupportsImages(m.provider, m.model),
        };
      })
      .filter((m) => showAll || m.available);

    try {
      const antigravityModels = await loadAntigravityModelsFromConnections(connections);
      const available = !activeProviders || activeProviders.has("antigravity");
      for (const model of antigravityModels) {
        const fullModel = `antigravity/${model.id}`;
        models.push({
          provider: "antigravity",
          model: model.id,
          name: model.name,
          fullModel,
          alias: modelAliases[fullModel] || model.id,
          available,
          supportsImages: modelSupportsImages("antigravity", model.id),
        });
      }
    } catch {
      // Antigravity catalog is fetched live; omit stale hardcoded entries on failure.
    }

    for (const providerId of LIVE_SYNC_MODEL_PROVIDERS) {
      const alias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
      const available =
        !activeProviders || activeProviders.has(providerId) || activeProviders.has(alias);
      const syncedModels = syncedModelsMap[providerId] || [];
      for (const model of syncedModels as Array<{ id: string; name?: string }>) {
        const fullModel = `${alias}/${model.id}`;
        if (models.some((entry) => entry.fullModel === fullModel)) continue;
        models.push({
          provider: alias,
          model: model.id,
          name: model.name || model.id,
          fullModel,
          alias: modelAliases[fullModel] || model.id,
          available,
          supportsImages: modelSupportsImages(alias, model.id),
        });
      }
    }

    return NextResponse.json({ models });
  } catch (error) {
    console.log("Error fetching models:", error);
    return NextResponse.json({ error: "Failed to fetch models" }, { status: 500 });
  }
}

// PUT /api/models - Update model alias
export async function PUT(request) {
  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          message: "Invalid request",
          details: [{ field: "body", message: "Invalid JSON body" }],
        },
      },
      { status: 400 }
    );
  }

  try {
    const validation = validateBody(updateModelAliasSchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { model, alias } = validation.data;

    const modelAliases = await getModelAliases();

    // Check if alias already exists for different model
    const existingModel = Object.entries(modelAliases).find(
      ([key, val]) => val === alias && key !== model
    );

    if (existingModel) {
      return NextResponse.json({ error: "Alias already in use" }, { status: 400 });
    }

    // Update alias
    await setModelAlias(model, alias);

    return NextResponse.json({ success: true, model, alias });
  } catch (error) {
    console.log("Error updating alias:", error);
    return NextResponse.json({ error: "Failed to update alias" }, { status: 500 });
  }
}
