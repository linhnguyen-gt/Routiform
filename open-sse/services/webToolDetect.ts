type JsonRecord = Record<string, unknown>;

const WEB_SEARCH_NAMES = new Set(["web_search", "websearch"]);
const WEB_FETCH_NAMES = new Set(["web_fetch", "webfetch", "fetch"]);

const FETCH_APPLY_MARKER = "Web page content:";

function stripProxyPrefix(name: string): string {
  return name.startsWith("proxy_") ? name.slice("proxy_".length) : name;
}

export function normalizeWebToolName(raw: string): string {
  return stripProxyPrefix(raw.trim().toLowerCase()).replace(/[\s-]+/g, "_");
}

export function isWebSearchName(name: string): boolean {
  const n = normalizeWebToolName(name);
  return WEB_SEARCH_NAMES.has(n);
}

export function isWebFetchName(name: string): boolean {
  const n = normalizeWebToolName(name);
  return WEB_FETCH_NAMES.has(n);
}

function isNativeWebType(type: string): "search" | "fetch" | null {
  const t = type.trim().toLowerCase();
  // Anthropic server tools: web_search, web_search_YYYYMMDD. Not OpenAI web_search_preview.
  if (t === "web_search" || /^web_search_\d{8}/.test(t)) return "search";
  if (t === "web_fetch" || /^web_fetch_\d{8}/.test(t)) return "fetch";
  return null;
}

export function toolKind(tool: JsonRecord): "search" | "fetch" | "other" {
  const type = typeof tool.type === "string" ? tool.type : "";
  const native = isNativeWebType(type);
  if (native) return native;
  const fn =
    tool.function && typeof tool.function === "object" ? (tool.function as JsonRecord) : null;
  const name =
    typeof fn?.name === "string" ? fn.name : typeof tool.name === "string" ? tool.name : "";
  if (!name) return "other";
  if (isWebSearchName(name)) return "search";
  if (isWebFetchName(name)) return "fetch";
  return "other";
}

export function forcedToolName(toolChoice: unknown): string {
  if (!toolChoice || typeof toolChoice !== "object") return "";
  const rec = toolChoice as JsonRecord;
  if (typeof rec.name === "string") return rec.name;
  const fn = rec.function && typeof rec.function === "object" ? (rec.function as JsonRecord) : null;
  return typeof fn?.name === "string" ? fn.name : "";
}

function collectMessageText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const rec = part as JsonRecord;
      if (typeof rec.text === "string") return rec.text;
      if (typeof rec.content === "string") return rec.content;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function extractFetchApplyPage(text: string): string | null {
  const idx = text.indexOf(FETCH_APPLY_MARKER);
  if (idx < 0) return null;
  const rest = text.slice(idx + FETCH_APPLY_MARKER.length).trim();
  if (!rest.startsWith("---")) return null;
  const inner = rest.slice(3);
  const end = inner.indexOf("\n---");
  const page = (end < 0 ? inner : inner.slice(0, end)).trim();
  return page.length > 0 ? page : null;
}

function lastUserContent(body: JsonRecord): string {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg || typeof msg !== "object") continue;
    const rec = msg as JsonRecord;
    if (rec.role !== "user") continue;
    const text = collectMessageText(rec.content).trimStart();
    if (text) return text;
  }
  if (typeof body.input === "string") return body.input.trimStart();
  return collectMessageText(body.input).trimStart();
}

export function isClaudeCodeFetchApply(body: JsonRecord): boolean {
  const tools = Array.isArray(body.tools) ? body.tools : [];
  if (tools.length > 0) return false;
  const text = lastUserContent(body);
  if (!text.startsWith(FETCH_APPLY_MARKER)) return false;
  return extractFetchApplyPage(text) !== null;
}

export function shouldInterceptWebTools(body: JsonRecord): boolean {
  if (!body || typeof body !== "object") return false;
  if (isClaudeCodeFetchApply(body)) return true;
  const tools = Array.isArray(body.tools) ? body.tools : [];
  if (tools.length === 0) return false;

  const kinds = tools
    .filter((t): t is JsonRecord => !!t && typeof t === "object")
    .map((t) => toolKind(t));
  const webKinds = kinds.filter((k) => k === "search" || k === "fetch");
  if (webKinds.length === 0) return false;

  const forced = forcedToolName(body.tool_choice);
  if (forced && (isWebSearchName(forced) || isWebFetchName(forced))) return true;
  return kinds.every((k) => k === "search" || k === "fetch");
}
