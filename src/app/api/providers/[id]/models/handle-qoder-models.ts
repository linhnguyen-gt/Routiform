import { NextResponse } from "next/server";
import { runWithProxyContext } from "@routiform/open-sse/utils/proxyFetch.ts";
import { resolveQoderModels } from "@routiform/open-sse/services/qoderModels.ts";
import { getStaticQoderModels } from "@routiform/open-sse/services/qoderCli.ts";
import type { GetModelsHandlerContext } from "./get-models-handler-context";

/**
 * Live Qoder model catalog handler.
 *
 * Calls the COSY-signed catalog endpoint (api3.qoder.sh/algo/api/v2/model/list)
 * via resolveQoderModels(). Falls back to the static 11-model registry when
 * the upstream is unreachable or the connection still uses PAT (no userId
 * for COSY signing).
 */
export async function handleQoderModels(
  ctx: GetModelsHandlerContext
): Promise<NextResponse | null> {
  if (ctx.provider !== "qoder") return null;

  const credentials = {
    accessToken: ctx.accessToken || ctx.apiKey || "",
    apiKey: ctx.apiKey || "",
    providerSpecificData: (ctx.connection.providerSpecificData ?? {}) as Record<string, unknown>,
  };

  // No COSY-capable creds → fall back to static catalog (PAT-only flows
  // can't sign the model_list call).
  const psd = credentials.providerSpecificData;
  const hasUserId = typeof psd.userId === "string" && psd.userId.trim().length > 0;
  if (!credentials.accessToken || !hasUserId) {
    return ctx.buildResponse({
      provider: ctx.provider,
      connectionId: ctx.connectionId,
      models: getStaticQoderModels(),
      source: "local_catalog",
      warning:
        "Qoder connection lacks device-flow credentials (userId). Live catalog unavailable; reconnect via OAuth to enable.",
    });
  }

  const catalog = await runWithProxyContext(ctx.proxy, () =>
    resolveQoderModels(credentials, { forceRefresh: true })
  ).catch(() => null);

  if (!catalog || catalog.models.length === 0) {
    return ctx.buildResponse({
      provider: ctx.provider,
      connectionId: ctx.connectionId,
      models: getStaticQoderModels(),
      source: "local_catalog",
      warning: "Qoder live catalog unavailable — using static fallback",
    });
  }

  return ctx.buildResponse({
    provider: ctx.provider,
    connectionId: ctx.connectionId,
    models: catalog.models.map((m) => ({ id: m.id, name: m.name })),
    source: "api",
  });
}
