import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { putAttachment } from "@/lib/db/chat";
import { classifyAttachment, isRejection, MAX_ATTACHMENT_BYTES } from "@/lib/chat/attachments";

/**
 * POST /api/attachments — store an uploaded file, return its content hash.
 *
 * Cookie-session only. A router API key (Bearer) must NOT reach this: chat_attachments lives in
 * the same storage.sqlite as call logs and billing, and an LLM key is handed to agents.
 *
 * The response is a hash, not bytes. Messages reference attachments by hash so that useChat —
 * which re-POSTs the entire message array on every turn — never carries base64 image data on
 * the wire and never trips the 10 MB body cap.
 */
export async function POST(request: Request) {
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  }

  // Read the cap before buffering the whole thing into memory.
  if (file.size > MAX_ATTACHMENT_BYTES) {
    const mb = (MAX_ATTACHMENT_BYTES / 1024 / 1024).toFixed(0);
    return NextResponse.json(
      { error: `File is too large. The limit is ${mb} MB.` },
      { status: 413 }
    );
  }

  const data = Buffer.from(await file.arrayBuffer());

  // Classified from the bytes. file.type is the browser's guess and is not trusted.
  const classified = classifyAttachment(data, file.type);
  if (isRejection(classified)) {
    return NextResponse.json({ error: classified.error }, { status: 400 });
  }

  try {
    const stored = putAttachment(data, classified.mime);
    return NextResponse.json({
      sha256: stored.sha256,
      mime: stored.mime,
      bytes: stored.bytes,
      kind: classified.kind,
      filename: file.name || "attachment",
    });
  } catch (error) {
    console.log("Error storing attachment:", error);
    return NextResponse.json({ error: "Failed to store the attachment." }, { status: 500 });
  }
}
