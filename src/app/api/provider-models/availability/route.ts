import { getLatestModelOutcomes } from "@/lib/db/modelAvailability";
import { isAuthenticated } from "@/shared/utils/apiAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/provider-models/availability?provider=<id>
 *
 * The last outcome of calling each of a provider's models, so the provider page can restore
 * its per-model pass/fail marks after a reload instead of showing every model as untested.
 *
 * Read-only: it reports what previous requests already recorded and never calls upstream.
 * Probing is an explicit user action, because each probe spends a real request against the
 * account's quota.
 */
export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) {
    return Response.json(
      { error: { message: "Authentication required", type: "invalid_api_key" } },
      { status: 401 }
    );
  }

  const provider = new URL(request.url).searchParams.get("provider")?.trim();
  if (!provider) {
    return Response.json(
      { error: { message: "provider query parameter is required", type: "invalid_request_error" } },
      { status: 400 }
    );
  }

  try {
    return Response.json({ provider, results: getLatestModelOutcomes(provider) });
  } catch (error) {
    return Response.json(
      {
        error: {
          message: error instanceof Error ? error.message : "Failed to read model availability",
          type: "server_error",
        },
      },
      { status: 500 }
    );
  }
}
