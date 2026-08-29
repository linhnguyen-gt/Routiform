/**
 * Claude Code nested helpers (REPL, compact, title gen, Haiku apply) send
 * /v1/messages with tools:[] and a small/fast model that resolves to provider
 * "claude". Without OAuth that 400s. Route those to an active combo instead.
 */

type JsonRecord = Record<string, unknown>;

export type HelperComboCandidate = {
  name?: string;
  models?: unknown[];
  isActive?: boolean;
  isHidden?: boolean;
};

export function isNestedHelperRequest(body: JsonRecord): boolean {
  if (!body || typeof body !== "object") return false;
  const tools = body.tools;
  return !(Array.isArray(tools) && tools.length > 0);
}

/**
 * Claude Code auto/manual compact. Older builds used tools:[]; 2.1.x still
 * attaches the full toolbag, so tools:[] is not sufficient. Match the
 * summarizer prompt instead.
 */
const COMPACT_PROMPT_MARKERS = [
  "tasked with summarizing conversations",
  "detailed summary of the conversation so far",
  "detailed summary of the RECENT portion of the conversation",
  "You MUST respond with ONLY the <summary>",
];

function messageTextForScan(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const content = (message as JsonRecord).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const text = (block as JsonRecord).text;
    if (typeof text === "string") parts.push(text);
  }
  return parts.join("\n");
}

function hasCompactMarker(text: string): boolean {
  if (!text) return false;
  return COMPACT_PROMPT_MARKERS.some((marker) => text.includes(marker));
}

export function isCompactSummarizerRequest(body: JsonRecord): boolean {
  if (!body || typeof body !== "object") return false;
  if (typeof body.system === "string" && hasCompactMarker(body.system)) return true;
  if (Array.isArray(body.system)) {
    for (const block of body.system) {
      if (
        block &&
        typeof block === "object" &&
        typeof (block as JsonRecord).text === "string" &&
        hasCompactMarker((block as JsonRecord).text as string)
      ) {
        return true;
      }
    }
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  // CC 2.1 puts the compact instruction after the transcript, then appends
  // trailing system reminders (`<total_tokens>`, style). Last-6 misses it.
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const role = (message as JsonRecord).role;
    if (role === "assistant" || role === "tool") continue;
    if (hasCompactMarker(messageTextForScan(message))) return true;
  }
  return false;
}

export function helperNeedsComboFallback(options: {
  combo: unknown;
  body: JsonRecord;
  provider: string | null | undefined;
  hasClaudeCredentials: boolean;
}): boolean {
  if (options.combo) return false;
  if (!isNestedHelperRequest(options.body)) return false;
  const provider = options.provider || "";
  if (provider !== "claude" && provider !== "cc") return false;
  return !options.hasClaudeCredentials;
}

export function pickActiveCombo<T extends HelperComboCandidate>(combos: T[]): T | null {
  for (const combo of combos) {
    if (combo.isActive === false || combo.isHidden === true) continue;
    if (!Array.isArray(combo.models) || combo.models.length === 0) continue;
    return combo;
  }
  return null;
}

export function hasUsableClaudeCredentials(creds: Record<string, unknown> | null): boolean {
  if (!creds || creds.allRateLimited === true) return false;
  return (
    (typeof creds.apiKey === "string" && creds.apiKey.length > 0) ||
    (typeof creds.accessToken === "string" && creds.accessToken.length > 0)
  );
}
