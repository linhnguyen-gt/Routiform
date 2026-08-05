/**
 * Does the CURRENT user turn carry an image?
 *
 * Current turn only, deliberately. A full-history scan would cost something on every request in
 * exchange for reordering a combo around an image the model already answered about several turns
 * ago. The post-rejection fallback still covers the case where an older image mattered.
 *
 * Never throws: a shape this does not recognize returns `false` and the caller keeps today's
 * behaviour.
 *
 * @module services/request-has-image
 */

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

/** An OpenAI `image_url`, a Claude `image`, or a Gemini `inlineData`/`inline_data` part. */
function partIsImage(part: unknown): boolean {
  const record = asRecord(part);
  if (!record) return false;

  const type = record.type;
  if (type === "image_url" || type === "image" || type === "input_image") return true;

  // Gemini: { inlineData: { mimeType, data } } — camelCase on the wire, snake_case in some SDKs.
  for (const key of ["inlineData", "inline_data"]) {
    const inline = asRecord(record[key]);
    if (!inline) continue;
    const mime = inline.mimeType ?? inline.mime_type;
    if (typeof mime === "string" && mime.startsWith("image/")) return true;
    // A part carrying inline data with no mime type is still not text.
    if (mime === undefined && typeof inline.data === "string") return true;
  }

  // Gemini file references to an image.
  const fileData = asRecord(record.fileData ?? record.file_data);
  if (fileData) {
    const mime = fileData.mimeType ?? fileData.mime_type;
    if (typeof mime === "string" && mime.startsWith("image/")) return true;
  }

  return false;
}

function contentHasImage(content: unknown): boolean {
  // A string turn is text by construction — the common case, and the cheapest exit.
  if (typeof content === "string" || content == null) return false;
  if (!Array.isArray(content)) return partIsImage(content);
  return content.some(partIsImage);
}

function lastUserEntry(list: unknown): JsonRecord | null {
  if (!Array.isArray(list)) return null;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const entry = asRecord(list[i]);
    if (entry && entry.role === "user") return entry;
  }
  return null;
}

/**
 * True when the last user turn of `body` carries an image, across the three wire shapes this
 * gateway accepts: OpenAI/Claude `messages`, Gemini `contents`, and the Responses API `input`.
 */
export function requestHasImage(body: unknown): boolean {
  const record = asRecord(body);
  if (!record) return false;

  try {
    // OpenAI chat completions and Claude Messages both use `messages[].content`.
    const message = lastUserEntry(record.messages);
    if (message) return contentHasImage(message.content);

    // Gemini: `contents[].parts`.
    const content = lastUserEntry(record.contents);
    if (content) return contentHasImage(content.parts);

    // Responses API: `input` is either a string or a list of turns whose parts live in `content`.
    const input = record.input;
    if (typeof input === "string") return false;
    const inputTurn = lastUserEntry(input);
    if (inputTurn) return contentHasImage(inputTurn.content);

    // An `input` array of bare parts, with no role wrapper.
    if (Array.isArray(input)) return input.some(partIsImage);

    return false;
  } catch {
    // Detection is an optimization. A malformed body falls through to today's ordering.
    return false;
  }
}
