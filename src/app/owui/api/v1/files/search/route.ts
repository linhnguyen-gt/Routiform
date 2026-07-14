import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { listAttachments } from "@/lib/db/chat-attachments";
import { attachmentToFileResponse } from "@/lib/owui/file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseNonNegativeInt(value: string | null, fallback: number, max?: number): number {
  const parsed = Number(value);
  if (value === null || !Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }
  return max !== undefined ? Math.min(parsed, max) : parsed;
}

/**
 * FilesModal.svelte always wraps the query in `*` glob wildcards (bare `*` for "no filter"), not
 * SQL LIKE syntax — `listAttachments` already wraps the term in `%...%`, so the SPA's own `*`
 * markers are stripped here rather than passed through as literal characters to match against.
 */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const rawFilename = url.searchParams.get("filename") ?? "*";
  const term = rawFilename.replace(/^\*+|\*+$/g, "");

  const skip = parseNonNegativeInt(url.searchParams.get("skip"), 0);
  const limit = parseNonNegativeInt(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);

  const matches = listAttachments({ search: term || undefined });
  const page = matches.slice(skip, skip + limit);

  return Response.json(page.map(attachmentToFileResponse));
}
