import { NextResponse } from "next/server";
import { runWithProxyContext } from "@routiform/open-sse/utils/proxyFetch.ts";
import { safeOutboundFetch } from "@/lib/network/safeOutboundFetch";
import { filterLatestClaudeModelRows } from "@/shared/services/claudeCodeConfig";
import type { GetModelsHandlerContext } from "./get-models-handler-context";

export async function handleClaudeStaticModels(
  ctx: GetModelsHandlerContext
): Promise<NextResponse | null> {
  if (ctx.provider !== "claude") return null;

  if (!ctx.apiKey && !ctx.accessToken) {
    return NextResponse.json(
      {
        error:
          "No Claude credentials configured for this connection. Reconnect Claude Code and try again.",
      },
      { status: 400 }
    );
  }

  const response = await runWithProxyContext(ctx.proxy, () =>
    safeOutboundFetch(
      "https://api.anthropic.com/v1/models",
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          ...(ctx.apiKey ? { "x-api-key": ctx.apiKey } : {}),
          ...(ctx.accessToken ? { Authorization: `Bearer ${ctx.accessToken}` } : {}),
        },
      },
      { timeoutMs: 15_000 }
    )
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.log("Error fetching models from claude:", errorText);
    return NextResponse.json(
      { error: `Failed to fetch models: ${response.status}` },
      { status: response.status }
    );
  }

  const data = (await response.json()) as { data?: unknown[]; models?: unknown[] };
  const rawModels = Array.isArray(data.data)
    ? data.data
    : Array.isArray(data.models)
      ? data.models
      : [];
  return ctx.buildResponse({
    provider: ctx.provider,
    connectionId: ctx.connectionId,
    models: filterLatestClaudeModelRows(rawModels),
  });
}
