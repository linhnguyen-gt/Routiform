/**
 * In-process bridge from the native chat to the router.
 *
 * The chat does NOT reach the router over HTTP. `handleChat(request)` already
 * takes a Request and returns a Response, and API-key policy, billing,
 * call-logging and format translation all live inside it — so a custom `fetch`
 * handed to the AI SDK provider can invoke it directly.
 *
 * Why not HTTP: there is no second listener by default. `runtime/ports.ts`
 * defaults `apiPort` and `dashboardPort` to the same `basePort`, and
 * `apiBridgeServer.ts` returns early when they are equal. Where they DO differ
 * (Docker), the "separate port" is a loopback proxy with a 30 s socket-inactivity
 * timeout that destroys any stream whose first token is slow — headers already
 * sent, so the caller sees a truncated body rather than a clean error.
 *
 * @module lib/chat/router-client
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV4 } from "@ai-sdk/provider";

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
 * Not decoration: `recordCost` is gated on `apiKeyInfo?.id`, which handleChat
 * resolves from the Authorization header via `enforceApiKeyPolicy`. Without a
 * key the turn still runs, but it is never attributed or billed.
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

export interface RouterTurn {
  /** The model to hand to `streamText`. */
  model: LanguageModelV4;
  /**
   * The router's request id for this turn, or null if the response carried none.
   * Only populated once the request has actually been dispatched — read it in
   * `onFinish`, not before.
   */
  getRequestId: () => string | null;
}

/**
 * Build a one-shot provider for a single chat turn.
 *
 * A fresh closure per turn, rather than a module-level provider, because the
 * request id must not leak between concurrent streams.
 */
export function createRouterTurn(modelId: string): RouterTurn {
  let requestId: string | null = null;

  const inProcessFetch: typeof fetch = async (_input, init) => {
    const apiKey = await ensureNativeChatKey();

    const headers = new Headers(init?.headers as HeadersInit | undefined);
    headers.set("authorization", `Bearer ${apiKey}`);
    headers.set("content-type", "application/json");

    // The URL is required by the provider contract but is never dialled.
    const request = new Request("http://in-process/v1/chat/completions", {
      method: "POST",
      headers,
      body: init?.body as BodyInit,
      signal: init?.signal ?? undefined,
    });

    const response = await handleChat(request);
    requestId = response.headers.get(REQUEST_ID_HEADER);
    return response;
  };

  const provider = createOpenAICompatible({
    name: "routiform",
    baseURL: "http://in-process/v1",
    fetch: inProcessFetch,
  });

  return {
    model: provider.chatModel(modelId),
    getRequestId: () => requestId,
  };
}
