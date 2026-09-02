import { NextResponse } from "next/server";
import {
  loadAntigravityModelsForConnection,
  DEFAULT_ANTIGRAVITY_MODELS,
} from "@/lib/providers/antigravityLiveModels";
import { toModelsRouteError } from "./models-route-error";
import type { GetModelsHandlerContext } from "./get-models-handler-context";

export { mapAntigravityAvailableModels } from "@/lib/providers/antigravityLiveModels";

export async function handleAntigravityModels(
  ctx: GetModelsHandlerContext
): Promise<NextResponse | null> {
  if (ctx.provider !== "antigravity") return null;

  try {
    const models = await loadAntigravityModelsForConnection(ctx.connection, ctx.proxy);
    return ctx.buildResponse({ provider: ctx.provider, connectionId: ctx.connectionId, models });
  } catch (err: unknown) {
    const mapped = toModelsRouteError(err);
    const msg = err instanceof Error ? err.message : String(err);
    console.log("[models] Antigravity model fetch error:", msg);
    return ctx.buildResponse({
      provider: ctx.provider,
      connectionId: ctx.connectionId,
      models: DEFAULT_ANTIGRAVITY_MODELS,
      source: "local_catalog",
      warning: `Antigravity live catalog unavailable (${mapped.message}) — using default models`,
    });
  }
}
