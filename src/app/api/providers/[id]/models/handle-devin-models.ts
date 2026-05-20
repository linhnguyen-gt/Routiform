import { NextResponse } from "next/server";
import { runWithProxyContext } from "@routiform/open-sse/utils/proxyFetch.ts";
import { safeOutboundFetch } from "@/lib/network/safeOutboundFetch";
import type { GetModelsHandlerContext } from "./get-models-handler-context";

export async function handleDevinModels(
  ctx: GetModelsHandlerContext
): Promise<NextResponse | null> {
  if (ctx.provider !== "devin") return null;

  const token = ctx.accessToken || ctx.apiKey;
  if (!token) {
    return NextResponse.json(
      { error: "No access token for Devin. Please reconnect." },
      { status: 400 }
    );
  }

  const response = await runWithProxyContext(ctx.proxy, () =>
    safeOutboundFetch(
      "https://server.codeium.com/exa.api_server_pb.ApiServerService/GetCascadeModelConfigs",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Connect-Protocol-Version": "1",
          "User-Agent": "windsurf/1.9600.41",
        },
        body: JSON.stringify({
          metadata: {
            apiKey: token,
            ideName: "windsurf",
            ideVersion: "1.9600.41",
            extensionName: "windsurf",
            extensionVersion: "1.9600.41",
            locale: "en",
          },
        }),
      },
      { timeoutMs: 15_000 }
    )
  ).catch(() => null);

  if (!response?.ok) {
    return NextResponse.json(
      { error: `Failed to fetch Devin models (${response?.status ?? "network error"})` },
      { status: response?.status ?? 500 }
    );
  }

  const data = (await response.json()) as {
    clientModelConfigs?: Array<{ modelUid?: string; label?: string }>;
  };

  const models = (data.clientModelConfigs ?? [])
    .filter((c) => c.modelUid && c.label)
    .map((c) => ({ id: c.modelUid as string, name: c.label as string }));

  return ctx.buildResponse({
    provider: ctx.provider,
    connectionId: ctx.connectionId,
    models,
    source: "api",
  });
}
