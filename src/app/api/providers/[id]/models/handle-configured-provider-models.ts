import { NextResponse } from "next/server";
import { runWithProxyContext } from "@routiform/open-sse/utils/proxyFetch.ts";
import { safeOutboundFetch } from "@/lib/network/safeOutboundFetch";
import { buildNvidiaModelsUrl } from "./nvidia-models-url";
import { normalizeProviderListedModels } from "./normalize-provider-listed-models";
import { buildXiaomiMimoTokenPlanModelsUrl } from "./xiaomi-mimo-token-plan-models-url";
import { getProviderBaseUrl } from "./json-utils";
import { PROVIDER_MODELS_CONFIG } from "./provider-models-config";
import type { GetModelsHandlerContext } from "./get-models-handler-context";

export async function handleConfiguredProviderModels(
  ctx: GetModelsHandlerContext
): Promise<NextResponse> {
  const config =
    ctx.provider in PROVIDER_MODELS_CONFIG
      ? PROVIDER_MODELS_CONFIG[ctx.provider as keyof typeof PROVIDER_MODELS_CONFIG]
      : undefined;
  if (!config) {
    return NextResponse.json(
      { error: `Provider ${ctx.provider} does not support models listing` },
      { status: 400 }
    );
  }

  const token = ctx.accessToken || ctx.apiKey;
  if (!token) {
    return NextResponse.json(
      {
        error:
          "No API key configured for this provider. Please add an API key in the provider settings.",
      },
      { status: 400 }
    );
  }

  const fromConnection = getProviderBaseUrl(ctx.connection.providerSpecificData) || "";
  let url =
    ctx.provider === "nvidia"
      ? buildNvidiaModelsUrl(getProviderBaseUrl(ctx.connection.providerSpecificData))
      : ctx.provider === "xiaomi-mimo-token-plan"
        ? buildXiaomiMimoTokenPlanModelsUrl(fromConnection)
        : config.url;

  if (ctx.provider === "xiaomi-mimo-token-plan" && !url) {
    return NextResponse.json(
      {
        error:
          "Configure Base URL from Xiaomi Token Plan → Subscription (OpenAI …/v1 or Anthropic …/anthropic).",
      },
      { status: 400 }
    );
  }
  const modelsListUrlForPaging = url;
  if (config.authQuery) {
    url += `${url.includes("?") ? "&" : "?"}${config.authQuery}=${token}`;
  }

  const headers = { ...config.headers };
  if (config.authHeader && !config.authQuery) {
    headers[config.authHeader] = (config.authPrefix || "") + token;
  }

  const fetchOptions: RequestInit = {
    method: config.method,
    headers,
  };

  if (config.body && config.method === "POST") {
    fetchOptions.body = JSON.stringify(config.body);
  }

  let allModels: unknown[] = [];
  let pageUrl = url;
  let pageCount = 0;
  const MAX_PAGES = 20;
  const seenTokens = new Set<string>();

  while (pageUrl && pageCount < MAX_PAGES) {
    pageCount++;
    const response = await runWithProxyContext(ctx.proxy, () =>
      safeOutboundFetch(pageUrl, fetchOptions, { timeoutMs: 15_000 })
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Error fetching models from ${ctx.provider}:`, errorText);
      return NextResponse.json(
        { error: `Failed to fetch models: ${response.status}` },
        { status: response.status }
      );
    }

    const data = (await response.json()) as Record<string, unknown>;
    const parsedModels = config.parseResponse(data);
    const pageModels = normalizeProviderListedModels(
      Array.isArray(parsedModels) ? parsedModels : []
    );
    allModels = allModels.concat(pageModels);

    const nextPageToken = typeof data.nextPageToken === "string" ? data.nextPageToken : undefined;
    if (!nextPageToken) break;
    if (seenTokens.has(nextPageToken)) {
      console.warn(
        `[models] ${ctx.provider}: duplicate nextPageToken detected, stopping pagination`
      );
      break;
    }
    seenTokens.add(nextPageToken);
    pageUrl = `${modelsListUrlForPaging}${modelsListUrlForPaging.includes("?") ? "&" : "?"}pageToken=${encodeURIComponent(nextPageToken)}`;
    if (config.authQuery) {
      pageUrl += `&${config.authQuery}=${token}`;
    }
  }

  if (pageCount > 1) {
    console.log(
      `[models] ${ctx.provider}: fetched ${allModels.length} models across ${pageCount} pages`
    );
  }

  return ctx.buildResponse({
    provider: ctx.provider,
    connectionId: ctx.connectionId,
    models: allModels,
  });
}
