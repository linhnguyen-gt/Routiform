import { randomUUID } from "crypto";

import { PROVIDERS } from "../config/constants.ts";
import { convertCommandCodeToOpenAI } from "../translator/response/commandcode-to-openai.ts";
import {
  BaseExecutor,
  buildStreamTtfbGuard,
  buildUpstreamSignal,
  getRequestTimeoutMs,
  mergeUpstreamExtraHeaders,
  type ExecuteInput,
  type ProviderCredentials,
} from "./base.ts";

/**
 * CommandCodeExecutor — talks to https://api.commandcode.ai/alpha/generate
 *
 * Auth: Bearer <user_xxx> API key.
 * Adds per-request `x-session-id` header expected by CommandCode upstream.
 *
 * Upstream returns AI SDK v5 NDJSON (one JSON event per line, no `data:` prefix).
 * We translate each event to an OpenAI chat.completion.chunk and emit it as SSE.
 */
export class CommandCodeExecutor extends BaseExecutor {
  constructor() {
    super("commandcode", PROVIDERS.commandcode);
  }

  buildHeaders(credentials: ProviderCredentials, stream = true) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.config.headers || {}),
      "x-session-id": randomUUID(),
    };

    const token = credentials?.apiKey || credentials?.accessToken;
    if (token) headers["Authorization"] = `Bearer ${token}`;

    if (stream) headers["Accept"] = "text/event-stream";
    return headers;
  }

  async execute({ model, body, stream, credentials, signal, upstreamExtraHeaders }: ExecuteInput) {
    const url = this.buildUrl(model, stream ?? true, 0);
    const headers = this.buildHeaders(credentials, stream ?? true);
    mergeUpstreamExtraHeaders(headers, upstreamExtraHeaders);
    const transformedBody = await this.transformRequest(model, body, stream ?? true, credentials);

    // Bound the upstream call by the client-disconnect signal + provider timeout;
    // the override previously passed only the disconnect signal. Streaming
    // requests bound only time-to-first-byte so healthy long streams survive.
    const requestTimeoutMs = getRequestTimeoutMs(this.config);
    const ttfbGuard =
      (stream ?? true) ? buildStreamTtfbGuard(signal ?? null, requestTimeoutMs) : null;
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(transformedBody),
      signal: ttfbGuard?.signal ?? buildUpstreamSignal(signal ?? null, requestTimeoutMs),
    });
    ttfbGuard?.headersReceived();

    if (!response.ok || !response.body) {
      return { response, url, headers, transformedBody };
    }

    return { response: wrapNdjsonAsOpenAISse(response, model), url, headers, transformedBody };
  }
}

function wrapNdjsonAsOpenAISse(originalResponse: Response, model: string): Response {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const state: Record<string, unknown> = { model };

  const emitChunks = (
    chunks: ReturnType<typeof convertCommandCodeToOpenAI>,
    controller: TransformStreamDefaultController
  ) => {
    if (!chunks) return;
    const list = Array.isArray(chunks) ? chunks : [chunks];
    for (const c of list) {
      if (c == null) continue;
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(c)}\n\n`));
    }
  };

  const transform = new TransformStream({
    transform(chunk: Uint8Array, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        emitChunks(convertCommandCodeToOpenAI(trimmed, state), controller);
      }
    },
    flush(controller) {
      const trimmed = buffer.trim();
      if (trimmed) {
        emitChunks(convertCommandCodeToOpenAI(trimmed, state), controller);
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    },
  });

  const newBody = originalResponse.body!.pipeThrough(transform);
  return new Response(newBody, {
    status: originalResponse.status,
    statusText: originalResponse.statusText,
    headers: originalResponse.headers,
  });
}

export default CommandCodeExecutor;
