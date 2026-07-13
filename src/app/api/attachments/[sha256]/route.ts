import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getAttachment } from "@/lib/db/chat";

const SHA256_HEX = /^[a-f0-9]{64}$/;

/**
 * GET /api/attachments/:sha256 — serve stored attachment bytes.
 *
 * This is the only remote image origin the markdown renderer allows (see lib/chat/markdown-safety),
 * so it must stay same-origin and behind the session cookie. Content is addressed by hash and
 * therefore immutable, which is what makes the long cache safe.
 */
export async function GET(request: Request, context: { params: Promise<{ sha256: string }> }) {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  const { sha256 } = await context.params;

  // Reject anything that is not a bare hex digest before it reaches the query.
  if (!SHA256_HEX.test(sha256)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attachment = getAttachment(sha256);
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new Response(new Uint8Array(attachment.data), {
    headers: {
      "Content-Type": attachment.mime,
      "Content-Length": String(attachment.bytes),
      // The MIME was sniffed from the bytes on upload, never taken from the client. nosniff
      // keeps the browser from second-guessing that and reinterpreting a stored file as HTML.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
