import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { classifyAttachment, isRejection, MAX_ATTACHMENT_BYTES } from "@/lib/chat/attachments";
import { listAttachments, putAttachment } from "@/lib/db/chat-attachments";
import { attachmentToFileResponse } from "@/lib/owui/file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Settings → Files with no search box touched yet: the unfiltered listing. */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  return Response.json(listAttachments().map(attachmentToFileResponse));
}

/**
 * Open WebUI's file upload.
 *
 * The file's **id IS its sha256** (see lib/db/chat-attachments.ts), so uploading the same
 * picture twice costs one row, and a file id cannot be forged into a reference to bytes that
 * were never uploaded.
 *
 * Cookie-session only: a router API key handed to a coding agent must not reach the same
 * SQLite file that holds call logs and billing.
 */
export async function POST(request: Request): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ detail: "Expected multipart/form-data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ detail: "No file was uploaded." }, { status: 400 });
  }

  // Checked before buffering the whole thing into memory.
  if (file.size > MAX_ATTACHMENT_BYTES) {
    const mb = (MAX_ATTACHMENT_BYTES / 1024 / 1024).toFixed(0);
    return Response.json({ detail: `File is too large. The limit is ${mb} MB.` }, { status: 413 });
  }

  const data = Buffer.from(await file.arrayBuffer());

  // Classified from the BYTES. file.type is the browser's guess and is not trusted.
  const classified = classifyAttachment(data, file.type);
  if (isRejection(classified)) {
    return Response.json({ detail: classified.error }, { status: 400 });
  }

  // The name is stored on the row, not just echoed back: Settings → Files lists attachments
  // straight from the table, and the name otherwise exists only inside a chat's JSON blob.
  const stored = putAttachment(data, classified.mime, file.name);

  // The shape the SPA reads back (MessageInput.svelte:685): it keeps `id`, and reads
  // `meta.content_type` to decide whether to render a thumbnail or a document chip. Same mapper
  // as the listing — the client matches an uploaded file against the list, and two hand-rolled
  // shapes drift.
  return Response.json(attachmentToFileResponse(stored));
}
