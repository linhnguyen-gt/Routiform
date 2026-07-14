/**
 * In-process bridge from the chat to the router.
 *
 * The chat does NOT reach the router over HTTP. `handleChat(request)` already takes a Request
 * and returns a Response, and API-key policy, billing, call-logging and format translation all
 * live inside it — so it can simply be called.
 *
 * Why not HTTP: there is no second listener by default. `runtime/ports.ts` defaults `apiPort`
 * and `dashboardPort` to the same `basePort`, and `apiBridgeServer.ts` returns early when they
 * are equal. Where they DO differ (Docker), the "separate port" is a loopback proxy with a 30 s
 * socket-inactivity timeout that destroys any stream whose first token is slow — headers
 * already sent, so the caller sees a truncated body rather than a clean error.
 *
 * @module lib/chat/router-client
 */

import { handleChat } from "@/sse/handlers/chat";
import { getApiKeys, createApiKey } from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";

const NATIVE_CHAT_KEY_NAME = "native-chat";

/** Correlation header the router stamps on every response; joins back to call_logs. */
export const REQUEST_ID_HEADER = "x-routiform-request-id";

let cachedKey: string | null = null;

/**
 * Provision (once) a local API key for the chat.
 *
 * Not decoration: `recordCost` is gated on `apiKeyInfo?.id`, which handleChat resolves from the
 * Authorization header via `enforceApiKeyPolicy`. Without a key the turn still runs, but it is
 * never attributed or billed.
 */
async function ensureNativeChatKey(): Promise<string> {
  if (cachedKey) return cachedKey;

  const keys = await getApiKeys();
  const existing = keys.find((k) => k.name === NATIVE_CHAT_KEY_NAME);
  if (existing && typeof existing.key === "string" && existing.key.length > 0) {
    cachedKey = existing.key;
    return cachedKey;
  }

  const machineId = await getConsistentMachineId();
  const created = await createApiKey(NATIVE_CHAT_KEY_NAME, machineId);
  cachedKey = created.key;
  return cachedKey;
}

/**
 * Call the router with an OpenAI-shaped body and get its raw Response back.
 *
 * The body goes out and the SSE comes back untouched. Open WebUI speaks OpenAI in both
 * directions, so there is nothing to translate — an earlier version of this module wrapped the
 * call in the AI SDK for the React chat's UI-message protocol, which is gone.
 */
export async function callRouter(body: unknown, signal?: AbortSignal): Promise<Response> {
  const apiKey = await ensureNativeChatKey();

  // The URL is required by the Request constructor but is never dialled — see above: there is
  // no second listener to dial.
  return handleChat(
    new Request("http://in-process/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    })
  );
}
