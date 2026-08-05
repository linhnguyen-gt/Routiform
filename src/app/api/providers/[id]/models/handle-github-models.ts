import { NextResponse } from "next/server";
import { OFFICIAL_GITHUB_COPILOT_MODELS } from "./github-copilot-official-models";
import type { GetModelsHandlerContext } from "./get-models-handler-context";

export async function handleGithubModels(
  ctx: GetModelsHandlerContext
): Promise<NextResponse | null> {
  if (ctx.provider !== "github") return null;

  // Served from the shared catalog rather than fetched. GitHub Copilot *does* expose
  // GET api.githubcopilot.com/models (an earlier comment here claimed otherwise), but
  // reaching it needs a Copilot token minted from the connection's OAuth token, and it
  // answers with ~30 internal orchestration and retired-snapshot entries alongside the
  // real ones. The catalog is that response with the noise filtered out; refreshing it
  // is a deliberate step, not something a page load should do.
  return ctx.buildResponse({
    provider: ctx.provider,
    connectionId: ctx.connectionId,
    models: OFFICIAL_GITHUB_COPILOT_MODELS.map((m) => ({ ...m })),
    source: "local_catalog",
  });
}
