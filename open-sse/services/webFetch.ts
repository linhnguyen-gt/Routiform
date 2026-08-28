import { safeOutboundFetch } from "@/lib/network/safeOutboundFetch";

const MAX_FETCH_CHARS = 24_000;
const MAX_FETCH_BYTES = 256 * 1024;

export async function readCappedText(
  response: Response,
  maxBytes = MAX_FETCH_BYTES
): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    response.body?.cancel().catch(() => {});
    throw new Error("Fetch body too large");
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    return text.length > maxBytes ? text.slice(0, maxBytes) : text;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      chunks.push(value.slice(0, Math.max(0, maxBytes - (total - value.byteLength))));
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type WebFetchResult = {
  url: string;
  text: string;
  source: "direct";
};

export async function fetchWebPage(url: string): Promise<WebFetchResult> {
  const response = await safeOutboundFetch(
    url,
    { method: "GET", headers: { Accept: "text/html,text/plain;q=0.9" } },
    { timeoutMs: 12_000 }
  );
  if (!response.ok) {
    throw new Error(`Fetch failed: HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  const raw = await readCappedText(response);
  const text = (contentType.includes("html") ? stripHtml(raw) : raw).slice(0, MAX_FETCH_CHARS);
  if (!text.trim()) throw new Error("Fetch returned empty content");
  return { url, text, source: "direct" };
}
