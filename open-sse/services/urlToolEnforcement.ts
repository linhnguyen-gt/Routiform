type JsonRecord = Record<string, unknown>;

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/i;
const URL_FETCH_INTENT_PATTERN =
  /(read|summari[sz]e|analy[sz]e|visit|fetch|crawl|extract|from\s+url|check\s+url|truy\s*c[aạ]p|t[oó]m\s*t[aắ]t|ph[aâ]n\s*t[ií]ch|[đd]ọc|xem\s+link|n[ộo]i\s*dung\s+url)/i;
const IMAGE_INTENT_PATTERN =
  /(image|photo|picture|screenshot|vision|ocr|img|\.png|\.jpg|\.jpeg|\.webp|\.gif|\.bmp|\.svg|[ảa]nh|h[iì]nh|phân\s*t[ií]ch\s*[ảa]nh|nhìn\s*[ảa]nh)/i;

const WEB_FETCH_TOOL_NAMES = new Set([
  "webfetch",
  "google_search",
  "webresearch_search_google",
  "webresearch_visit_page",
  "playwright_browser_navigate",
  "chrome-devtools_navigate_page",
]);

function stripProxyPrefix(name: string): string {
  return name.startsWith("proxy_") ? name.slice("proxy_".length) : name;
}

function collectPromptText(body: JsonRecord): string {
  const chunks: string[] = [];

  if (Array.isArray(body.messages)) {
    for (const message of body.messages) {
      if (!message || typeof message !== "object") continue;
      const msg = message as JsonRecord;
      if (typeof msg.content === "string") {
        chunks.push(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (!part || typeof part !== "object") continue;
          const partObj = part as JsonRecord;
          if (typeof partObj.text === "string") chunks.push(partObj.text);
          if (typeof partObj.content === "string") chunks.push(partObj.content);
          if (typeof partObj.url === "string") chunks.push(partObj.url);
        }
      }
    }
  }

  if (Array.isArray(body.input)) {
    for (const item of body.input) {
      if (!item || typeof item !== "object") continue;
      const inputItem = item as JsonRecord;
      if (typeof inputItem.content === "string") chunks.push(inputItem.content);
      if (Array.isArray(inputItem.content)) {
        for (const part of inputItem.content) {
          if (!part || typeof part !== "object") continue;
          const partObj = part as JsonRecord;
          if (typeof partObj.text === "string") chunks.push(partObj.text);
          if (typeof partObj.url === "string") chunks.push(partObj.url);
        }
      }
    }
  }

  return chunks.join("\n");
}

function hasImageSignals(body: JsonRecord): boolean {
  const scanParts = (parts: unknown[]): boolean => {
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const partObj = part as JsonRecord;
      const partType = typeof partObj.type === "string" ? partObj.type.toLowerCase() : "";
      if (partType === "image" || partType === "image_url" || partType === "input_image") {
        return true;
      }
      const imageUrl = partObj.image_url;
      if (imageUrl && typeof imageUrl === "object") {
        const url = (imageUrl as JsonRecord).url;
        if (typeof url === "string" && url.trim().length > 0) return true;
      }
      const source = partObj.source;
      if (source && typeof source === "object") {
        const src = source as JsonRecord;
        if (
          typeof src.media_type === "string" &&
          src.media_type.toLowerCase().startsWith("image/")
        ) {
          return true;
        }
      }
      if (typeof partObj.url === "string") {
        const lower = partObj.url.toLowerCase();
        if (/\.(png|jpe?g|webp|gif|bmp|svg)(\?|#|$)/.test(lower)) return true;
      }
    }
    return false;
  };

  if (Array.isArray(body.messages)) {
    for (const message of body.messages) {
      if (!message || typeof message !== "object") continue;
      const msg = message as JsonRecord;
      if (Array.isArray(msg.content) && scanParts(msg.content)) return true;
    }
  }

  if (Array.isArray(body.input)) {
    for (const item of body.input) {
      if (!item || typeof item !== "object") continue;
      const inputItem = item as JsonRecord;
      if (Array.isArray(inputItem.content) && scanParts(inputItem.content)) return true;
    }
  }

  return false;
}

function hasWebFetchTools(body: JsonRecord): boolean {
  if (!Array.isArray(body.tools)) return false;
  for (const tool of body.tools) {
    if (!tool || typeof tool !== "object") continue;
    const toolObj = tool as JsonRecord;
    const fn =
      toolObj.function && typeof toolObj.function === "object"
        ? (toolObj.function as JsonRecord)
        : null;
    const rawName =
      typeof fn?.name === "string" ? fn.name : typeof toolObj.name === "string" ? toolObj.name : "";
    if (!rawName) continue;
    const normalized = stripProxyPrefix(rawName.trim().toLowerCase());
    if (WEB_FETCH_TOOL_NAMES.has(normalized)) return true;
  }
  return false;
}

function shouldEnforce(body: JsonRecord): boolean {
  if (hasImageSignals(body)) return false;
  const promptText = collectPromptText(body);
  if (!promptText) return false;
  if (!URL_PATTERN.test(promptText)) return false;
  if (!URL_FETCH_INTENT_PATTERN.test(promptText)) return false;
  if (IMAGE_INTENT_PATTERN.test(promptText)) return false;
  return hasWebFetchTools(body);
}

export function maybeEnforceRequiredToolChoiceForUrlFetch(body: JsonRecord): boolean {
  if (!body || typeof body !== "object") return false;
  if (!shouldEnforce(body)) return false;

  const toolChoice = body.tool_choice;
  if (toolChoice && toolChoice !== "auto") {
    return false;
  }

  body.tool_choice = "required";
  return true;
}
