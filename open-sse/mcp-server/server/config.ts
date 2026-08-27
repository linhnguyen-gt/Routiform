import { MCP_TOOL_MAP } from "../schemas/tools.ts";

// ============ Configuration ============
export const ROUTIFORM_BASE_URL =
  process.env.ROUTIFORM_BASE_URL || process.env.ROUTIFORM_BASE_URL || "http://localhost:20128";
export const ROUTIFORM_API_KEY =
  process.env.ROUTIFORM_API_KEY || process.env.ROUTIFORM_API_KEY || "";

/**
 * Full scope manifest across every registered tool. stdio callers are granted this set by
 * virtue of running on a trusted-local transport; HTTP callers only ever get what the
 * transport binds into authInfo after bearer-key validation.
 */
export const FULL_TOOL_SCOPES = Object.freeze(
  Array.from(new Set(Object.values(MCP_TOOL_MAP).flatMap((tool) => [...tool.scopes])))
);

/**
 * Internal fetch helper that calls Routiform API endpoints.
 */
export async function routiformFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const url = `${ROUTIFORM_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(ROUTIFORM_API_KEY ? { Authorization: `Bearer ${ROUTIFORM_API_KEY}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(10000) });

  if (!response.ok) {
    // Log the upstream body server-side only; callers get a stable message without its contents.
    const detail = await response.text().catch(() => "");
    console.error(`[MCP] Routiform API ${response.status} ${path}:`, detail.slice(0, 500));
    throw new Error(`Routiform API error [${response.status}]`);
  }
  return response.json();
}
