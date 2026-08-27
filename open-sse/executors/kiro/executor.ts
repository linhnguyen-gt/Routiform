/**
 * Kiro (AWS CodeWhisperer) executor.
 *
 * Thin orchestrator: request building lives in ./request.ts, the EventStream→SSE
 * conversion in ./event-stream.ts, binary frame parsing in ./event-frame.ts and
 * <thinking> tag stripping in ./thinking-tags.ts. This class wires them onto the
 * BaseExecutor contract.
 *
 * @module executors/kiro/executor
 */
import { PROVIDERS } from "../../config/constants.ts";
import { getAccessToken } from "../../services/tokenRefresh.ts";
import {
  BaseExecutor,
  buildStreamTtfbGuard,
  buildUpstreamSignal,
  getRequestTimeoutMs,
  mergeUpstreamExtraHeaders,
  type ExecuteInput,
  type ExecutorLog,
  type ProviderCredentials,
} from "../base.ts";
import { transformKiroEventStreamToSSE } from "./event-stream.ts";
import { buildKiroHeaders, buildKiroUrl, transformKiroRequest } from "./request.ts";

/**
 * KiroExecutor - Executor for Kiro AI (AWS CodeWhisperer)
 * Uses AWS CodeWhisperer streaming API with AWS EventStream binary format
 */
export class KiroExecutor extends BaseExecutor {
  constructor() {
    super("kiro", PROVIDERS.kiro);
  }

  buildUrl(
    model: string,
    stream: boolean,
    urlIndex = 0,
    credentials: ProviderCredentials | null = null
  ): string {
    void model;
    void stream;
    void urlIndex;
    return buildKiroUrl(this.config, credentials);
  }

  buildHeaders(credentials: ProviderCredentials, stream = true) {
    void stream;
    return buildKiroHeaders(this.config.headers, credentials);
  }

  transformEventStreamToSSE(response: Response, model: string) {
    return transformKiroEventStreamToSSE(response, model);
  }

  transformRequest(model: string, body: unknown, stream: boolean, credentials: unknown): unknown {
    void stream;
    void credentials;
    return transformKiroRequest(body);
  }

  /**
   * Custom execute for Kiro - handles AWS EventStream binary response
   */
  async execute({ model, body, stream, credentials, signal, upstreamExtraHeaders }: ExecuteInput) {
    const url = this.buildUrl(model, stream, 0, credentials);
    const headers = this.buildHeaders(credentials, stream);
    mergeUpstreamExtraHeaders(headers, upstreamExtraHeaders);
    const transformedBody = await this.transformRequest(model, body, stream, credentials);
    // Bound the fetch by both the client-disconnect signal and the provider
    // timeout — without the latter an unresponsive CodeWhisperer endpoint hung
    // forever (the base-class timeout never reached this override). Streaming
    // requests bound only time-to-first-byte so a healthy long-lived stream is
    // never truncated mid-body; stall detection after headers is downstream's job.
    const requestTimeoutMs = getRequestTimeoutMs(this.config);
    const ttfbGuard = stream ? buildStreamTtfbGuard(signal ?? null, requestTimeoutMs) : null;
    const upstreamSignal =
      ttfbGuard?.signal ?? buildUpstreamSignal(signal ?? null, requestTimeoutMs);

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(transformedBody),
      signal: upstreamSignal,
    });
    ttfbGuard?.headersReceived();

    if (!response.ok) {
      return { response, url, headers, transformedBody };
    }

    // For Kiro, we need to transform the binary EventStream to SSE
    // Create a TransformStream to convert binary to SSE text
    const transformedResponse = transformKiroEventStreamToSSE(response, model);

    return { response: transformedResponse, url, headers, transformedBody };
  }

  async refreshCredentials(credentials: ProviderCredentials, log?: ExecutorLog | null) {
    if (!credentials.refreshToken) return null;

    try {
      // Route through the centralized service so concurrent 401-triggered
      // refreshes for the same credential share one in-flight OAuth exchange
      // (refreshPromiseCache dedup) instead of racing N parallel ones. The
      // AWS SSO OIDC / Social Auth response parsing lives inside the service.
      const result = await getAccessToken("kiro", credentials, log);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log?.error?.("TOKEN", `Kiro refresh error: ${err.message}`);
      return null;
    }
  }
}

export default KiroExecutor;
