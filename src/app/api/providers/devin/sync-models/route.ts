import { NextResponse } from "next/server";
import { getProviderConnections, replaceCustomModels } from "@/lib/localDb";
import { isAuthRequired, isAuthenticated } from "@/shared/utils/apiAuth";
import { runWithProxyContext } from "@routiform/open-sse/utils/proxyFetch.ts";
import { resolveProxyForProvider } from "@/models";

export async function GET(request: Request) {
  if (await isAuthRequired()) {
    if (!(await isAuthenticated(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const connections = await getProviderConnections({ provider: "devin" });
    const active = (connections as Array<Record<string, unknown>>).find(
      (c) => c.isActive !== false
    );
    if (!active) {
      return NextResponse.json({ error: "No active Devin connection found" }, { status: 400 });
    }

    const apiKey = active.accessToken as string;
    if (!apiKey) {
      return NextResponse.json({ error: "No access token for Devin connection" }, { status: 400 });
    }

    const proxy = await resolveProxyForProvider("devin");
    const models = await runWithProxyContext(proxy, () => fetchCascadeModels(apiKey));

    await replaceCustomModels("devin", models);

    return NextResponse.json({ models });
  } catch (error: unknown) {
    console.log("Devin sync-models error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

async function fetchCascadeModels(apiKey: string) {
  const res = await fetch(
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
          apiKey,
          ideName: "windsurf",
          ideVersion: "1.9600.41",
          extensionName: "windsurf",
          extensionVersion: "1.9600.41",
          locale: "en",
        },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`GetCascadeModelConfigs failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    clientModelConfigs?: Array<{ modelUid?: string; label?: string }>;
  };
  const configs = data.clientModelConfigs || [];

  return configs
    .filter((c) => c.modelUid && c.label)
    .map((c) => ({ id: c.modelUid as string, name: c.label as string }));
}
