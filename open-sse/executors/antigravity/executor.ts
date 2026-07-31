/**
 * Antigravity (Google Cloud Code) executor.
 *
 * Thin orchestrator: each concern lives in its own module (header building,
 * request transform, rate-limit flow, SSE collection, token refresh) and this
 * class wires them onto the BaseExecutor contract.
 *
 * @module executors/antigravity/executor
 */
import { PROVIDERS } from "../../config/constants.ts";
import { BaseExecutor } from "../base.ts";
import { executeAntigravityRequest } from "./execute-loop.ts";
import { buildAntigravityHeaders, buildAntigravityUrl } from "./header-builder.ts";
import { buildAntigravityRequest, generateAntigravitySessionId } from "./request-transform.ts";
import { parseRetryFromErrorMessage, parseRetryHeaders } from "./retry-policy.ts";
import { collectAntigravityStream } from "./stream-collector.ts";
import { refreshAntigravityTokens, type RefreshedAntigravityTokens } from "./token-refresh.ts";
import type {
  AntigravityCredentials,
  AntigravityExecuteInput,
  AntigravityLog,
  AntigravityRequestBody,
  AntigravityRuntime,
  ExecutorResult,
} from "./types.ts";

export class AntigravityExecutor extends BaseExecutor implements AntigravityRuntime {
  constructor() {
    super("antigravity", PROVIDERS.antigravity);
  }

  buildUrl(model: string, stream: boolean, urlIndex = 0): string {
    void model;
    void stream;
    return buildAntigravityUrl(this.getBaseUrls(), urlIndex);
  }

  buildHeaders(credentials: AntigravityCredentials, _stream = true): Record<string, string> {
    void _stream;
    return buildAntigravityHeaders(credentials);
  }

  /** Returns the upstream body, or a `Response` to forward verbatim (missing project → 422). */
  async transformRequest(
    model: string,
    body: AntigravityRequestBody,
    stream: boolean,
    credentials: AntigravityCredentials,
    log?: AntigravityLog
  ): Promise<Record<string, unknown> | Response> {
    void stream;
    return buildAntigravityRequest(model, body, credentials, log);
  }

  async refreshCredentials(
    credentials: AntigravityCredentials,
    log?: AntigravityLog
  ): Promise<RefreshedAntigravityTokens | null> {
    return refreshAntigravityTokens(this.config, credentials, log);
  }

  generateSessionId(): string {
    return generateAntigravitySessionId();
  }

  parseRetryHeaders(headers: Headers): number | null {
    return parseRetryHeaders(headers);
  }

  parseRetryFromErrorMessage(errorMessage: string): number | null {
    return parseRetryFromErrorMessage(errorMessage);
  }

  /**
   * Collect an SSE streaming response into a single non-streaming JSON response.
   * Parses Gemini-format SSE chunks and assembles text content + usage into one
   * OpenAI-format chat.completion payload.
   */
  collectStreamToResponse(
    response: Response,
    model: string,
    url: string,
    headers: Record<string, string>,
    transformedBody: Record<string, unknown>,
    log?: AntigravityLog,
    signal?: AbortSignal | null
  ): Promise<ExecutorResult> {
    return collectAntigravityStream(response, model, url, headers, transformedBody, log, signal);
  }

  execute(input: AntigravityExecuteInput): Promise<ExecutorResult> {
    return executeAntigravityRequest(this, input);
  }
}

export default AntigravityExecutor;
