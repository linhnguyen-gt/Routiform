import { NextResponse } from "next/server";
import { isOpenAICompatibleProvider } from "@/shared/constants/providers";
import { PROVIDER_MODELS } from "@/shared/constants/models";
import { runWithProxyContext } from "@routiform/open-sse/utils/proxyFetch.ts";
import { isOutboundUrlPolicyError, safeOutboundFetch } from "@/lib/network/safeOutboundFetch";
import { asRecord, getProviderBaseUrl } from "./json-utils";
import { toModelsRouteError } from "./models-route-error";
import type { GetModelsHandlerContext } from "./get-models-handler-context";

/** Node surfaces a refused TCP connection as ECONNREFUSED, usually wrapped in a fetch TypeError. */
function isConnectionRefused(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 4; depth += 1) {
    const record = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (record.code === "ECONNREFUSED") return true;
    if (typeof record.message === "string" && record.message.includes("ECONNREFUSED")) return true;
    current = record.cause;
  }
  return false;
}

function isLocalTarget(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

export async function handleOpenAICompatibleModels(
  ctx: GetModelsHandlerContext
): Promise<NextResponse | null> {
  if (!isOpenAICompatibleProvider(ctx.provider)) return null;

  const baseUrl = getProviderBaseUrl(ctx.connection.providerSpecificData);
  if (!baseUrl) {
    return NextResponse.json(
      { error: "No base URL configured for OpenAI compatible provider" },
      { status: 400 }
    );
  }

  let base = baseUrl.replace(/\/$/, "");
  if (base.endsWith("/chat/completions")) {
    base = base.slice(0, -17);
  } else if (base.endsWith("/completions")) {
    base = base.slice(0, -12);
  } else if (base.endsWith("/v1")) {
    base = base.slice(0, -3);
  }

  const endpoints = [`${base}/v1/models`, `${base}/models`, `${baseUrl.replace(/\/$/, "")}/models`];

  const uniqueEndpoints = [...new Set(endpoints)];
  let models = null;
  let lastErrorStatus = null;
  let policyError: unknown = null;
  let connectionRefused = false;

  for (const modelsUrl of uniqueEndpoints) {
    try {
      const response = await runWithProxyContext(ctx.proxy, () =>
        safeOutboundFetch(
          modelsUrl,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${ctx.apiKey}`,
            },
          },
          // Loopback opt-in, deliberately written out here rather than hidden behind a helper.
          // `baseUrl` is operator configuration written through a session-only route, never a URL
          // derived from request content — that is the whole property that makes this safe, and it
          // is only checkable if the option is visible at the call site.
          {
            timeoutMs: 5_000,
            guard: { allowLoopback: true, allowPrivateAddress: true },
          }
        )
      );

      if (response.ok) {
        const data = await response.json();
        models = data.data || data.models || [];
        break;
      }

      if (response.status === 401 || response.status === 403) {
        lastErrorStatus = response.status;
        throw new Error("auth_failed");
      }
    } catch (err: unknown) {
      if (isOutboundUrlPolicyError(err)) {
        policyError = err;
        break;
      }
      const error = err as { message?: string };
      if (error.message === "auth_failed") break;
      if (isConnectionRefused(err)) connectionRefused = true;
    }
  }

  if (!models) {
    if (policyError) {
      const mappedPolicy = toModelsRouteError(policyError);
      return NextResponse.json({ error: mappedPolicy.message }, { status: mappedPolicy.status });
    }
    // A local endpoint that is simply not running is the common failure here, and a generic
    // "using cached catalog" hides it. Name the address instead.
    if (connectionRefused && isLocalTarget(baseUrl)) {
      return NextResponse.json(
        {
          error: `Could not reach ${baseUrl} — is the local server running?`,
        },
        { status: 502 }
      );
    }

    if (lastErrorStatus === 401 || lastErrorStatus === 403) {
      return NextResponse.json(
        { error: `Auth failed: ${lastErrorStatus}` },
        { status: lastErrorStatus }
      );
    }

    console.warn(`[models] All endpoints failed for ${ctx.provider}, using local catalog`);
    const localModels = PROVIDER_MODELS[ctx.provider] || [];
    models = localModels.map((m: unknown) => {
      const model = asRecord(m);
      return {
        id: model.id,
        name: model.name || model.id,
        owned_by: ctx.provider,
      };
    });
  }

  const source =
    models === null || (models && models.length > 0 && models[0].owned_by === ctx.provider)
      ? "local_catalog"
      : "api";

  return ctx.buildResponse({
    provider: ctx.provider,
    connectionId: ctx.connectionId,
    models,
    source,
    ...(source === "local_catalog" ? { warning: "API unavailable — using cached catalog" } : {}),
  });
}
