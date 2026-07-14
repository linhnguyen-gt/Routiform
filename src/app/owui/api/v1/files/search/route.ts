import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { listAttachments, type ChatAttachmentMeta } from "@/lib/db/chat-attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** The shape FilesModal.svelte reads: `filename`, `meta.size`, `created_at` in unix seconds. */
function toFileResponse(row: ChatAttachmentMeta) {
  return {
    id: row.sha256,
    filename: row.filename || row.sha256,
    meta: {
      name: row.filename || row.sha256,
      content_type: row.mime,
      size: row.bytes,
    },
    created_at: Math.floor(row.createdAt / 1000),
  };
}

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

  return Response.json(page.map(toFileResponse));
}
