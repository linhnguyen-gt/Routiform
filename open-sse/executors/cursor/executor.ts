/**
 * CursorExecutor — public class.
 *
 * Thin orchestrator: auth headers, transport (http2/fetch), and the protobuf
 * → JSON/SSE response transformers each live in their own module; this class
 * wires them onto the BaseExecutor contract and preserves the historical
 * method surface (`buildHeaders`, `transformProtobufToSSE`, …) on the
 * prototype.
 *
 * @module executors/cursor/executor
 */
import { PROVIDERS, HTTP_STATUS } from "../../config/constants.ts";
import {
  BaseExecutor,
  buildUpstreamSignal,
  getRequestTimeoutMs,
  mergeUpstreamExtraHeaders,
} from "../base.ts";
import { generateCursorBody } from "../../utils/cursorProtobuf.ts";
import type { CursorHttpResponse } from "./errors.ts";
import { http2 } from "./shared.ts";
import { generateChecksum as checksumFor, buildHeaders as buildCursorHeaders } from "./auth.ts";
import { makeFetchRequest as fetchRequest, makeHttp2Request as http2Request } from "./transport.ts";
import { transformProtobufToJSON as transformToJSON } from "./response-json.ts";
import { transformProtobufToSSE as transformToSSE } from "./response-sse.ts";

export class CursorExecutor extends BaseExecutor {
  constructor() {
    super("cursor", PROVIDERS.cursor);
  }

  buildUrl() {
    return `${this.config.baseUrl}${this.config.chatPath || ""}`;
  }

  generateChecksum(machineId) {
    return checksumFor(machineId);
  }

  buildHeaders(credentials) {
    return buildCursorHeaders(credentials);
  }

  transformRequest(model, body, _stream, _credentials) {
    // Messages are already translated by chatCore (claude→openai→cursor)
    // Do NOT call buildCursorRequest again — double-translation drops tool_results
    const messages = body.messages || [];
    const tools = body.tools || [];
    const reasoningEffort = body.reasoning_effort || null;
    return generateCursorBody(messages, model, tools, reasoningEffort);
  }

  makeFetchRequest(
    url: string,
    headers: Record<string, string>,
    body: Uint8Array,
    signal?: AbortSignal
  ): Promise<CursorHttpResponse> {
    return fetchRequest(url, headers, body, signal);
  }

  makeHttp2Request(
    url: string,
    headers: Record<string, string>,
    body: Uint8Array,
    signal?: AbortSignal
  ): Promise<CursorHttpResponse> {
    return http2Request(url, headers, body, signal);
  }

  async execute({ model, body, stream, credentials, signal, log: _log, upstreamExtraHeaders }) {
    const url = this.buildUrl();
    const headers = this.buildHeaders(credentials);
    mergeUpstreamExtraHeaders(headers, upstreamExtraHeaders);
    const transformedBody = await this.transformRequest(model, body, stream, credentials);

    // Cursor buffers the entire (protobuf) body before transforming it, so the
    // full-lifetime timeout is the correct bound here — unlike SSE-passthrough
    // executors there is no long-lived stream to protect after headers arrive.
    const upstreamSignal = buildUpstreamSignal(signal ?? null, getRequestTimeoutMs(this.config));

    try {
      const response: CursorHttpResponse = http2
        ? await this.makeHttp2Request(url, headers, transformedBody, upstreamSignal)
        : await this.makeFetchRequest(url, headers, transformedBody, upstreamSignal);

      if (response.status !== 200) {
        const errorText = response.body?.toString() || "Unknown error";
        const errorResponse = new Response(
          JSON.stringify({
            error: {
              message: `[${response.status}]: ${errorText}`,
              type: "invalid_request_error",
              code: "",
            },
          }),
          {
            status: response.status,
            headers: { "Content-Type": "application/json" },
          }
        );
        return { response: errorResponse, url, headers, transformedBody: body };
      }

      const transformedResponse =
        stream !== false
          ? this.transformProtobufToSSE(response.body, model, body)
          : this.transformProtobufToJSON(response.body, model, body);

      return { response: transformedResponse, url, headers, transformedBody: body };
    } catch (error) {
      const errorResponse = new Response(
        JSON.stringify({
          error: {
            message: error.message,
            type: "connection_error",
            code: "",
          },
        }),
        {
          status: HTTP_STATUS.SERVER_ERROR,
          headers: { "Content-Type": "application/json" },
        }
      );
      return { response: errorResponse, url, headers, transformedBody: body };
    }
  }

  transformProtobufToJSON(buffer, model, body) {
    return transformToJSON(buffer, model, body);
  }

  transformProtobufToSSE(buffer, model, body) {
    return transformToSSE(buffer, model, body);
  }

  async refreshCredentials() {
    return null;
  }
}

export default CursorExecutor;
