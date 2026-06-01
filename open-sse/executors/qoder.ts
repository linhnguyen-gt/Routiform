/**
 * QoderExecutor — sends OpenAI-format chat requests to Qoder's COSY-signed
 * inference endpoint at api3.qoder.sh, then unwraps Qoder's `{statusCodeValue,
 * body}` SSE envelope back into plain OpenAI SSE for the rest of the pipeline.
 *
 *   - URL is api3.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation
 *     with `&Encode=1` so we can ship the body through the WAF-bypass
 *     encoder.
 *   - Authentication is COSY (RSA + AES + MD5 + ~17 Cosy-* headers), not
 *     a static HMAC.
 *   - The request shape Qoder expects is non-trivial (chat_context with
 *     mirrored modelConfig, business block with stable IDs, system text
 *     hoisted out of the messages array). All ported from the reference.
 *   - Model identifier is one of the canonical 11 keys (auto / ultimate /
 *     performance / efficient / lite + 6 frontier "*model" ids); the
 *     translator layer feeds us "qoder/<key>" so we strip the prefix.
 *   - Per-model `model_config` is fetched live from /algo/api/v2/model/list
 *     and cached. Sending the wrong block silently downgrades to a
 *     different model upstream, so a missing entry is a hard error.
 */

import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";

import { BaseExecutor, type ExecuteInput, type ProviderCredentials } from "./base.ts";
import { PROVIDERS } from "../config/constants.ts";
import { qoderEncodeBody } from "@/lib/qoder/encoding";
import { buildCosyHeaders } from "@/lib/qoder/cosy";
import { QODER_CHAT_URL_ENCODED } from "@/lib/qoder/constants";
import {
  getQoderModelConfig,
  resolveQoderModels,
  type QoderModelConfig,
} from "../services/qoderModels.ts";

type JsonRecord = Record<string, unknown>;

type QoderChatMessage = {
  role?: string;
  content?: unknown;
};

/**
 * Hoist role:"system" messages out of the messages array (Qoder rejects
 * system in messages) and flatten any multipart content arrays.
 */
function normalizeMessages(messages: unknown): {
  messages: QoderChatMessage[];
  systemText: string;
} {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { messages: [], systemText: "" };
  }
  const systemParts: string[] = [];
  const out: QoderChatMessage[] = [];
  for (const msg of messages as QoderChatMessage[]) {
    if (!msg || typeof msg !== "object") continue;
    const text = extractText(msg.content);
    if (msg.role === "system") {
      if (text) systemParts.push(text);
      continue;
    }
    const cloned: QoderChatMessage = { ...msg };
    cloned.content = text;
    out.push(cloned);
  }
  return { messages: out, systemText: systemParts.join("\n\n") };
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (item && typeof item === "object") {
        const r = item as JsonRecord;
        if (r.type === "text" && typeof r.text === "string") {
          parts.push(r.text);
        } else if (typeof r.text === "string") {
          parts.push(r.text);
        }
      }
    }
    return parts.join("\n");
  }
  return String(content);
}

function lastUserText(messages: QoderChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "user" && typeof m.content === "string") {
      return m.content;
    }
  }
  return "";
}

function stableHash(prefix: string, ...parts: Array<string | number | undefined | null>): string {
  const h = createHash("sha256");
  h.update(prefix);
  for (const p of parts) {
    h.update("\0");
    h.update(String(p ?? ""));
  }
  return h.digest("hex").slice(0, 16);
}

function stableChatRecordId(
  model: string,
  messages: QoderChatMessage[],
  tools: unknown,
  maxTokens: number
): string {
  const h = createHash("sha256");
  h.update("qoder-record\0");
  h.update(String(model));
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    if (m.role) {
      h.update("\0");
      h.update(m.role);
    }
    if (typeof m.content === "string" && m.content) {
      h.update("\0");
      h.update(m.content);
    }
  }
  if (tools) {
    h.update("\0");
    try {
      h.update(JSON.stringify(tools));
    } catch {
      /* ignore */
    }
  }
  h.update(`\0mt=${maxTokens}`);
  return h.digest("hex").slice(0, 16);
}

function truncate(s: string, n: number): string {
  return s && s.length > n ? `${s.slice(0, n)}...` : s || "";
}

/**
 * Map the OpenAI-style request body into the exact shape Qoder expects.
 */
async function buildQoderRequestBody({
  model,
  body,
  credentials,
  signal,
}: {
  model: string;
  body: unknown;
  credentials: ProviderCredentials;
  signal?: AbortSignal | null;
}): Promise<{ qoderKey: string; payload: JsonRecord; modelConfig: QoderModelConfig }> {
  const qoderKey = String(model || "").replace(/^(qoder|qd)\//, "");
  if (!qoderKey) {
    throw new Error(`qoder: empty model id (received "${model}")`);
  }

  // Live catalog is the source of truth — no hard-coded model whitelist.
  // The first call for a fresh credential primes the cache; subsequent
  // calls hit the in-memory map until TTL expiry (1h, see qoderModels.ts).
  let modelConfig = await getQoderModelConfig(credentials, qoderKey, { signal });
  if (!modelConfig) {
    // Force-refresh once before giving up — handles "first ever call for
    // this credential" and "server added a new key after our last fetch".
    const refreshed = await resolveQoderModels(credentials, { forceRefresh: true, signal });
    const retried = refreshed?.rawConfigs.get(qoderKey);
    if (!retried) {
      const known = refreshed
        ? Array.from(refreshed.rawConfigs.keys()).join(", ")
        : "(catalog unavailable)";
      throw new Error(`qoder: model "${qoderKey}" not in server catalog. Known keys: ${known}`);
    }
    modelConfig = { ...retried, key: qoderKey };
  }

  const reqBody = (body && typeof body === "object" ? body : {}) as JsonRecord;
  const { messages, systemText } = normalizeMessages(reqBody.messages || []);
  const tools = reqBody.tools;
  const isReasoning = !!modelConfig.is_reasoning;
  const maxOutputTokens = Number(modelConfig.max_output_tokens) || 0;

  let maxTokens = 32_768;
  if (maxOutputTokens > 0) maxTokens = maxOutputTokens;
  if (
    typeof reqBody.max_tokens === "number" &&
    reqBody.max_tokens > 0 &&
    reqBody.max_tokens < maxTokens
  ) {
    maxTokens = reqBody.max_tokens;
  }
  if (
    typeof reqBody.max_completion_tokens === "number" &&
    reqBody.max_completion_tokens > 0 &&
    reqBody.max_completion_tokens < maxTokens
  ) {
    maxTokens = reqBody.max_completion_tokens;
  }

  const lastUser = lastUserText(messages);
  const psd = (credentials.providerSpecificData || {}) as JsonRecord;
  const sessionId = stableHash("qoder-session", String(psd.userId || ""), qoderKey);
  const recordId = stableChatRecordId(qoderKey, messages, tools, maxTokens);

  const payload: JsonRecord = {
    request_id: uuidv4(),
    request_set_id: recordId,
    chat_record_id: recordId,
    session_id: sessionId,
    stream: true,
    chat_task: "FREE_INPUT",
    is_reply: true,
    is_retry: false,
    source: 1,
    version: "3",
    session_type: "qodercli",
    agent_id: "agent_common",
    task_id: "common",
    code_language: "",
    chat_prompt: "",
    image_urls: null,
    aliyun_user_type: "",
    system: systemText,
    messages,
    tools: Array.isArray(tools) ? tools : [],
    parameters: { max_tokens: maxTokens },
    chat_context: {
      chatPrompt: "",
      imageUrls: null,
      extra: {
        context: [],
        modelConfig: { key: qoderKey, is_reasoning: isReasoning },
        originalContent: lastUser,
      },
      features: [],
      text: lastUser,
    },
    model_config: modelConfig,
    business: {
      product: "cli",
      version: "1.0.0",
      type: "agent",
      stage: "start",
      id: uuidv4(),
      name: truncate(lastUser, 30),
      begin_at: Date.now(),
    },
  };

  return { qoderKey, payload, modelConfig };
}

/**
 * Wrap the upstream's `{statusCodeValue, body}` SSE envelope into plain
 * OpenAI SSE chunks the rest of the chatCore pipeline understands.
 */
function wrapQoderSSE(response: Response, model: string): Response {
  if (!response.ok || !response.body) return response;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let doneEmitted = false;

  const processLine = (line: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    const trimmed = line.replace(/\r$/, "").trim();
    if (!trimmed) return;
    if (!trimmed.startsWith("data:")) return;
    if (doneEmitted) return; // never forward chunks past stream end

    const data = trimmed.slice(5).trimStart();
    if (data === "[DONE]") {
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      doneEmitted = true;
      return;
    }

    let envelope: { statusCodeValue?: number; body?: unknown } | null = null;
    try {
      envelope = JSON.parse(data);
    } catch {
      return;
    }
    if (!envelope) return;
    const statusVal = typeof envelope.statusCodeValue === "number" ? envelope.statusCodeValue : 200;
    const inner = typeof envelope.body === "string" ? envelope.body : "";
    if (statusVal !== 200) {
      const msg = inner || `upstream status ${statusVal}`;
      const errChunk = JSON.stringify({
        id: `qoder-error-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            delta: { content: `\n[qoder error ${statusVal}: ${truncate(msg, 200)}]` },
            finish_reason: "stop",
          },
        ],
      });
      controller.enqueue(encoder.encode(`data: ${errChunk}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      doneEmitted = true;
      return;
    }
    if (!inner) return;
    if (inner === "[DONE]") {
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      doneEmitted = true;
      return;
    }
    // Inner is an OpenAI-shaped chunk. Strip embedded newlines so the SSE
    // frame stays a single event.
    const sanitized = inner.replace(/\r?\n/g, "");
    controller.enqueue(encoder.encode(`data: ${sanitized}\n\n`));
  };

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        processLine(line, controller);
      }
    },
    flush(controller) {
      buffer += decoder.decode();
      if (buffer.length > 0) {
        processLine(buffer, controller);
        buffer = "";
      }
      if (!doneEmitted) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        doneEmitted = true;
      }
    },
  });

  const transformed = response.body.pipeThrough(transform);
  return new Response(transformed, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}

export class QoderExecutor extends BaseExecutor {
  constructor() {
    super("qoder", PROVIDERS.qoder);
  }

  buildUrl(): string {
    return QODER_CHAT_URL_ENCODED;
  }

  async execute({ model, body, credentials, signal }: ExecuteInput) {
    const url = this.buildUrl();

    const psd = (credentials?.providerSpecificData || {}) as JsonRecord;
    const userId = typeof psd.userId === "string" ? psd.userId : "";
    if (!userId) {
      // No user id → no way to sign. Surface a 401 so the dashboard nudges
      // the user back to OAuth.
      const fakeResp = new Response(
        JSON.stringify({
          error: { message: "qoder credential is missing userId; reconnect the account" },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
      return { response: fakeResp, url, headers: {}, transformedBody: body };
    }
    if (!credentials?.accessToken) {
      const fakeResp = new Response(
        JSON.stringify({
          error: { message: "qoder credential is missing accessToken; reconnect the account" },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
      return { response: fakeResp, url, headers: {}, transformedBody: body };
    }

    let qoderKey: string;
    let payload: JsonRecord;
    try {
      ({ qoderKey, payload } = await buildQoderRequestBody({ model, body, credentials, signal }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const fakeResp = new Response(JSON.stringify({ error: { message } }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
      return { response: fakeResp, url, headers: {}, transformedBody: body };
    }

    const plainBody = Buffer.from(JSON.stringify(payload), "utf8");
    const encodedBodyStr = qoderEncodeBody(plainBody);
    const encodedBodyBuf = Buffer.from(encodedBodyStr, "latin1");

    let cosyHeaders: Record<string, string>;
    try {
      cosyHeaders = buildCosyHeaders(encodedBodyBuf, url, {
        userId,
        authToken: credentials.accessToken,
        name:
          (typeof psd.displayName === "string" && psd.displayName) ||
          (typeof psd.name === "string" && psd.name) ||
          "",
        email: typeof psd.email === "string" ? psd.email : "",
        machineId: typeof psd.machineId === "string" ? psd.machineId : "",
      });
    } catch (err: unknown) {
      // cosy throws synchronously on missing userId/authToken — surface
      // as 401 so chatCore prompts re-auth instead of returning a 500.
      const message = err instanceof Error ? err.message : String(err);
      const fakeResp = new Response(
        JSON.stringify({ error: { message: `qoder cosy signing failed: ${message}` } }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
      return { response: fakeResp, url, headers: {}, transformedBody: body };
    }

    const modelConfigSource =
      (payload.model_config && (payload.model_config as JsonRecord).source) || "system";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Model-Key": qoderKey,
      "X-Model-Source": String(modelConfigSource),
      // gzip triggers signature validation on Qoder's CDN; force identity.
      "Accept-Encoding": "identity",
      ...cosyHeaders,
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: encodedBodyBuf,
      signal: signal ?? undefined,
    });

    if (!response.ok) {
      // Pass error response through unchanged so chatCore can capture it.
      return { response, url, headers, transformedBody: payload };
    }

    const wrapped = wrapQoderSSE(response, `qoder/${qoderKey}`);
    return { response: wrapped, url, headers, transformedBody: payload };
  }

  // Qoder device tokens don't refresh through OAuth — the upstream returns
  // 403 for our flow. Surfacing failure via 401-on-chat is enough; the
  // dashboard tells users to re-login when their token expires (~30 days).
  async refreshCredentials(): Promise<null> {
    return null;
  }

  needsRefresh(): boolean {
    return false;
  }
}

export default QoderExecutor;

// Internals exposed for unit tests.
export const __test__ = {
  normalizeMessages,
  wrapQoderSSE,
};
