type JsonRecord = Record<string, unknown>;

const LOCAL_IMAGE_PATH_PATTERN =
  /(?:[a-zA-Z]:\\|\/)[^\n\r]*\.(?:png|jpe?g|webp|gif|bmp|svg)(?:\s|$|["'`.,!?\]])/i;
const IMAGE_ANALYSIS_INTENT_PATTERN =
  /(analy[sz]e|describe|inspect|ocr|vision|ph[aâ]n\s*t[ií]ch|m[oô]\s*t[ảa]|[đd]ọc\s*[ảa]nh|xem\s*[ảa]nh)/i;

function normalizeToolName(name: string): string {
  const lowered = name.trim().toLowerCase();
  if (lowered.startsWith("proxy_") && lowered.length > 6) return lowered.slice(6);
  return lowered;
}

function collectPromptText(body: JsonRecord): string {
  const chunks: string[] = [];
  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      if (!msg || typeof msg !== "object") continue;
      const message = msg as JsonRecord;
      if (typeof message.content === "string") {
        chunks.push(message.content);
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (!part || typeof part !== "object") continue;
          const p = part as JsonRecord;
          if (typeof p.text === "string") chunks.push(p.text);
          if (typeof p.content === "string") chunks.push(p.content);
        }
      }
    }
  }
  return chunks.join("\n");
}

function hasStructuredImageInput(body: JsonRecord): boolean {
  if (!Array.isArray(body.messages)) return false;
  for (const msg of body.messages) {
    if (!msg || typeof msg !== "object") continue;
    const message = msg as JsonRecord;
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (!part || typeof part !== "object") continue;
      const p = part as JsonRecord;
      const t = typeof p.type === "string" ? p.type.toLowerCase() : "";
      if (t === "image" || t === "image_url" || t === "input_image") return true;
    }
  }
  return false;
}

function hasMediaTool(body: JsonRecord): boolean {
  if (!Array.isArray(body.tools)) return false;
  for (const tool of body.tools) {
    if (!tool || typeof tool !== "object") continue;
    const t = tool as JsonRecord;
    const fn = t.function && typeof t.function === "object" ? (t.function as JsonRecord) : null;
    const rawName =
      typeof fn?.name === "string" ? fn.name : typeof t.name === "string" ? t.name : "";
    if (!rawName) continue;
    if (normalizeToolName(rawName) === "filesystem_read_media_file") return true;
  }
  return false;
}

function hasFilesystemMediaToolCall(body: JsonRecord): boolean {
  if (!Array.isArray(body.messages)) return false;
  for (const rawMsg of body.messages) {
    if (!rawMsg || typeof rawMsg !== "object") continue;
    const msg = rawMsg as JsonRecord;
    if (!Array.isArray(msg.tool_calls)) continue;
    for (const tc of msg.tool_calls) {
      if (!tc || typeof tc !== "object") continue;
      const call = tc as JsonRecord;
      const fn =
        call.function && typeof call.function === "object" ? (call.function as JsonRecord) : null;
      const rawName =
        typeof fn?.name === "string" ? fn.name : typeof call.name === "string" ? call.name : "";
      if (normalizeToolName(rawName) === "filesystem_read_media_file") {
        return true;
      }
    }
  }
  return false;
}

function hasReadImageFailureFlow(body: JsonRecord): boolean {
  if (!Array.isArray(body.messages)) return false;

  let hasReadToolCall = false;
  let hasImageReadSuccessMarker = false;
  let hasImageUnsupportedMarker = false;

  for (const rawMsg of body.messages) {
    if (!rawMsg || typeof rawMsg !== "object") continue;
    const msg = rawMsg as JsonRecord;

    if (Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        if (!tc || typeof tc !== "object") continue;
        const call = tc as JsonRecord;
        const fn =
          call.function && typeof call.function === "object" ? (call.function as JsonRecord) : null;
        const name = typeof fn?.name === "string" ? normalizeToolName(fn.name) : "";
        if (name === "read") {
          hasReadToolCall = true;
          break;
        }
      }
    }

    if (typeof msg.content === "string") {
      const lower = msg.content.toLowerCase();
      if (lower.includes("image read successfully")) hasImageReadSuccessMarker = true;
      if (
        lower.includes("cannot read image") ||
        lower.includes("does not support image input") ||
        lower.includes("attached image(s) from tool result")
      ) {
        hasImageUnsupportedMarker = true;
      }
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (!part || typeof part !== "object") continue;
        const p = part as JsonRecord;
        const text = typeof p.text === "string" ? p.text.toLowerCase() : "";
        if (!text) continue;
        if (text.includes("image read successfully")) hasImageReadSuccessMarker = true;
        if (
          text.includes("cannot read image") ||
          text.includes("does not support image input") ||
          text.includes("attached image(s) from tool result")
        ) {
          hasImageUnsupportedMarker = true;
        }
      }
    }
  }

  return hasReadToolCall && hasImageReadSuccessMarker && hasImageUnsupportedMarker;
}

export function maybeEnforceMediaToolForLocalImage(body: JsonRecord): boolean {
  if (!body || typeof body !== "object") return false;
  if (hasStructuredImageInput(body)) return false;
  if (!hasMediaTool(body)) return false;
  if (hasFilesystemMediaToolCall(body)) return false;

  if (hasReadImageFailureFlow(body)) {
    body.tool_choice = {
      type: "function",
      function: { name: "filesystem_read_media_file" },
    };
    return true;
  }

  const prompt = collectPromptText(body);
  if (!prompt) return false;
  if (!LOCAL_IMAGE_PATH_PATTERN.test(prompt)) return false;
  if (!IMAGE_ANALYSIS_INTENT_PATTERN.test(prompt)) return false;

  const toolChoice = body.tool_choice;
  if (toolChoice && toolChoice !== "auto" && toolChoice !== "required") {
    return false;
  }

  body.tool_choice = {
    type: "function",
    function: { name: "filesystem_read_media_file" },
  };
  return true;
}
