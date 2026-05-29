import { safeOutboundFetch } from "@/lib/network/safeOutboundFetch";
import { runWithProxyContext } from "@routiform/open-sse/utils/proxyFetch.ts";
import { NextResponse } from "next/server";
import type { GetModelsHandlerContext } from "./get-models-handler-context";
import { asRecord, getProviderBaseUrl } from "./json-utils";
import {
  buildKiroModelsEndpoint,
  mapKiroModelsFromApi,
  mapKiroModelsFromListApi,
  mergeKiroModels,
  normalizeKiroBaseUrl,
} from "./kiro-models";

function buildKiroFallbackModels() {
  return mergeKiroModels([]);
}

export async function handleKiroModels(ctx: GetModelsHandlerContext): Promise<NextResponse | null> {
  if (ctx.provider !== "kiro") return null;

  const token = ctx.accessToken || ctx.apiKey;
  if (!token) {
    return NextResponse.json(
      { error: "No access token for Kiro. Please reconnect OAuth." },
      { status: 400 }
    );
  }

  const psd = asRecord(ctx.connection.providerSpecificData);
  const configuredBaseUrl =
    typeof psd.kiroModelsBaseUrl === "string"
      ? psd.kiroModelsBaseUrl
      : getProviderBaseUrl(ctx.connection.providerSpecificData);
  const baseUrl = normalizeKiroBaseUrl(configuredBaseUrl);

  // Strategy 1: Try GET /ListAvailableModels (REST API — returns full model catalog)
  const profileArn = typeof psd.profileArn === "string" ? psd.profileArn : undefined;

  const listModelsParams = new URLSearchParams({ origin: "AI_EDITOR", maxResults: "50" });
  if (profileArn) {
    listModelsParams.set("profileArn", profileArn);
  }

  const listModelsUrl = `${baseUrl}/ListAvailableModels?${listModelsParams.toString()}`;

  let response: Response | null = null;

  response = await runWithProxyContext(ctx.proxy, () =>
    safeOutboundFetch(
      listModelsUrl,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "x-amzn-codewhisperer-optout": "true",
          "User-Agent": "AWS-SDK-JS/3.0.0 kiro-ide/1.0.0",
          "X-Amz-User-Agent": "aws-sdk-js/3.0.0 kiro-ide/1.0.0",
        },
      },
      { timeoutMs: 10_000 }
    )
  ).catch(() => null);

  if (response && response.ok) {
    const payload = await response.json();
    const models = mapKiroModelsFromListApi(payload);

    if (models.length > 0) {
      return ctx.buildResponse({
        provider: ctx.provider,
        connectionId: ctx.connectionId,
        models,
        source: "api",
      });
    }
  }

  // Strategy 2: Fallback to POST ListAvailableProfiles (legacy — returns profile names as models)
  const endpoint = buildKiroModelsEndpoint(baseUrl);
  const profileTargets = [
    "AmazonCodeWhispererService.ListAvailableProfiles",
    "AmazonQDeveloperService.ListAvailableProfiles",
  ];

  let legacyResponse: Response | null = null;
  let lastStatus: number | null = null;

  for (const target of profileTargets) {
    legacyResponse = await runWithProxyContext(ctx.proxy, () =>
      safeOutboundFetch(
        endpoint,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/x-amz-json-1.0",
            Accept: "application/json",
            "x-amz-target": target,
            "x-amzn-codewhisperer-optout": "true",
            "User-Agent": "AWS-SDK-JS/3.0.0 kiro-ide/1.0.0",
            "X-Amz-User-Agent": "aws-sdk-js/3.0.0 kiro-ide/1.0.0",
          },
          body: JSON.stringify({}),
        },
        { timeoutMs: 10_000 }
      )
    ).catch(() => null);

    if (!legacyResponse) continue;
    if (legacyResponse.ok) break;
    lastStatus = legacyResponse.status;
  }

  if (!legacyResponse) {
    return ctx.buildResponse({
      provider: ctx.provider,
      connectionId: ctx.connectionId,
      models: buildKiroFallbackModels(),
      source: "local_catalog",
      warning: "Kiro API unavailable — using local catalog",
    });
  }

  if (!legacyResponse.ok) {
    return ctx.buildResponse({
      provider: ctx.provider,
      connectionId: ctx.connectionId,
      models: buildKiroFallbackModels(),
      source: "local_catalog",
      warning: `Kiro API unavailable (${lastStatus ?? legacyResponse.status}) — using local catalog`,
    });
  }

  const payload = await legacyResponse.json();
  const models = mapKiroModelsFromApi(payload, !ctx.excludeHidden);

  if (models.length === 0) {
    return ctx.buildResponse({
      provider: ctx.provider,
      connectionId: ctx.connectionId,
      models: buildKiroFallbackModels(),
      source: "local_catalog",
      warning: "Kiro API returned no models — using local catalog",
    });
  }

  return ctx.buildResponse({
    provider: ctx.provider,
    connectionId: ctx.connectionId,
    models,
    source: "api",
  });
}
