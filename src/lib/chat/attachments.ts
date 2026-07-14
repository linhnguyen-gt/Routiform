/**
 * Validation for chat attachments.
 *
 * Two rules drive everything here:
 *
 * 1. The client's declared MIME type is not evidence. A browser sends whatever the OS guessed
 *    from the file extension, and an attacker sends whatever they like. Images are identified
 *    by their magic bytes; a file claiming image/png that does not start with the PNG signature
 *    is rejected rather than forwarded to a provider that will choke on it.
 *
 * 2. Size is capped BEFORE the bytes reach the model. proxy.ts enforces a 10 MB body cap and
 *    useChat re-POSTs the whole message array every turn, which is why attachments are stored
 *    as blobs and referenced by hash instead of inlined. The cap here is about what a single
 *    provider request can carry, not about what the wire can hold.
 *
 * @module lib/chat/attachments
 */

/** Per-file cap. Providers reject oversized images anyway; failing here gives a clear reason. */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/** Image formats every image-carrying translator in the matrix can actually encode. */
const IMAGE_SIGNATURES: Array<{ mime: string; test: (b: Buffer) => boolean }> = [
  {
    mime: "image/png",
    test: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: "image/jpeg",
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/gif",
    test: (b) =>
      b.subarray(0, 6).toString("ascii") === "GIF87a" ||
      b.subarray(0, 6).toString("ascii") === "GIF89a",
  },
  {
    // RIFF....WEBP
    mime: "image/webp",
    test: (b) =>
      b.subarray(0, 4).toString("ascii") === "RIFF" &&
      b.subarray(8, 12).toString("ascii") === "WEBP",
  },
];

export type AttachmentKind = "image" | "text";

export interface ClassifiedAttachment {
  kind: AttachmentKind;
  /** The sniffed MIME for images; text/plain for text. Never the client's claim. */
  mime: string;
}

export type AttachmentRejection = { error: string };

/** Sniff an image by signature. Returns null when the bytes are not a supported image. */
export function sniffImageMime(data: Buffer): string | null {
  if (data.byteLength < 12) return null;
  for (const sig of IMAGE_SIGNATURES) {
    if (sig.test(data)) return sig.mime;
  }
  return null;
}

/**
 * Is this plausibly text a model can read?
 *
 * A NUL byte means binary. Beyond that we require the content to survive a UTF-8 round trip —
 * a mislabelled .zip or .pdf would otherwise be inlined into the prompt as mojibake, burning
 * tokens and telling the model nothing.
 */
export function isProbablyText(data: Buffer): boolean {
  if (data.byteLength === 0) return false;
  if (data.includes(0)) return false;

  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(data);
  if (decoded.includes("�")) return false;
  return true;
}

/**
 * Decide what an uploaded file is, from its bytes alone.
 *
 * `declaredMime` is accepted only as a hint about intent (did the user mean to send an image?)
 * and never as the answer.
 */
export function classifyAttachment(
  data: Buffer,
  declaredMime: string | null | undefined
): ClassifiedAttachment | AttachmentRejection {
  if (data.byteLength === 0) {
    return { error: "The file is empty." };
  }
  if (data.byteLength > MAX_ATTACHMENT_BYTES) {
    const mb = (MAX_ATTACHMENT_BYTES / 1024 / 1024).toFixed(0);
    return { error: `File is too large. The limit is ${mb} MB.` };
  }

  const imageMime = sniffImageMime(data);
  if (imageMime) {
    return { kind: "image", mime: imageMime };
  }

  // Claimed to be an image but the bytes say otherwise: reject rather than silently inline it
  // as text, which is how a corrupt upload turns into a confusing model answer.
  if (declaredMime?.startsWith("image/")) {
    return {
      error: "That does not look like a supported image. Use PNG, JPEG, GIF, or WebP.",
    };
  }

  if (isProbablyText(data)) {
    return { kind: "text", mime: "text/plain" };
  }

  return { error: "Unsupported file. Attach an image (PNG, JPEG, GIF, WebP) or a text file." };
}

export function isRejection(
  result: ClassifiedAttachment | AttachmentRejection
): result is AttachmentRejection {
  return "error" in result;
}

/** The data: URL every image-carrying translator understands. */
export function toDataUrl(mime: string, data: Buffer): string {
  return `data:${mime};base64,${data.toString("base64")}`;
}
