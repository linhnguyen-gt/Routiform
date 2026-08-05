/**
 * URL and header construction for the Antigravity (Cloud Code) upstream.
 *
 * @module executors/antigravity/header-builder
 */
import { scrubProxyAndFingerprintHeaders } from "../../services/antigravityHeaderScrub.ts";
import { antigravityUserAgent, googApiClientHeader } from "../../services/antigravityHeaders.ts";
import type { AntigravityCredentials } from "./types.ts";

/**
 * Always use the streaming endpoint — the non-streaming `generateContent` causes
 * upstream 400 errors for some models (e.g. gpt-oss-120b-medium) because the
 * Cloud Code API internally converts to OpenAI format and injects
 * stream_options without setting stream=true. chatCore already handles
 * SSE→JSON conversion for non-streaming client requests.
 *
 * Note: the injection above happens inside Cloud Code, not here. A client's own
 * `stream_options` never reaches this upstream — the OpenAI→Antigravity
 * translator builds a fresh Cloud Code envelope (`openaiToAntigravityRequest`),
 * so `buildAntigravityRequest`'s passthrough spread has nothing to carry it in.
 * Nothing needs to strip it; see tests/unit/antigravity-stream-options-strip.test.mjs.
 */
export function buildAntigravityUrl(baseUrls: string[], urlIndex = 0): string {
  const baseUrl = baseUrls[urlIndex] || baseUrls[0];
  return `${baseUrl}/v1internal:streamGenerateContent?alt=sse`;
}

export function buildAntigravityHeaders(
  credentials: AntigravityCredentials
): Record<string, string> {
  const raw = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${credentials.accessToken}`,
    "User-Agent": antigravityUserAgent(),
    "X-Goog-Api-Client": googApiClientHeader(),
    Accept: "text/event-stream",
  };
  // Scrub proxy/fingerprint headers that reveal non-native traffic
  const cleaned = scrubProxyAndFingerprintHeaders(raw);
  // Anti-loop: tell MITM server to passthrough (stripped by Google)
  cleaned["x-routiform-source"] = "routiform";
  return cleaned;
}
