import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getAttachment } from "@/lib/db/chat-attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The bytes back. This is what the composer's thumbnail and the message's image render from. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const attachment = getAttachment(id);
  if (!attachment) {
    return Response.json({ detail: "File not found" }, { status: 404 });
  }

  return new Response(new Uint8Array(attachment.data), {
    headers: {
      "content-type": attachment.mime,
      "content-length": String(attachment.bytes),
      // Content-addressed by sha256: the bytes at this id can never change, so this is safe
      // to cache hard. `private` because the store sits behind the session cookie.
      "cache-control": "private, max-age=31536000, immutable",
      // Defence in depth: an uploaded SVG or HTML would otherwise be same-origin script.
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
    },
  });
}
