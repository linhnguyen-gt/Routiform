/**
 * Shared types for the Antigravity executor modules.
 *
 * @module executors/antigravity/types
 */
import type { ExecutorLog, ProviderCredentials } from "../base.ts";

/** Antigravity OAuth credentials — adds the Cloud Code project + account identity fields. */
export type AntigravityCredentials = ProviderCredentials & {
  projectId?: string;
  email?: string;
  sub?: string;
};

/** Logger handle as passed through the executor call chain (always optional). */
export type AntigravityLog = ExecutorLog | null;

export type AntigravityPart = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: Record<string, unknown>;
  functionResponse?: Record<string, unknown>;
  [key: string]: unknown;
};

export type AntigravityContent = {
  role?: string;
  parts?: AntigravityPart[];
  [key: string]: unknown;
};

export type AntigravityInnerRequest = {
  contents?: AntigravityContent[];
  sessionId?: string;
  tools?: unknown[];
  toolConfig?: unknown;
  safetySettings?: unknown;
  [key: string]: unknown;
};

/** Cloud Code envelope: routing metadata wrapping the Gemini-format `request`. */
export type AntigravityRequestBody = {
  project?: string;
  model?: string;
  userAgent?: string;
  requestType?: string;
  requestId?: string;
  request?: AntigravityInnerRequest;
  [key: string]: unknown;
};

/** Value returned by `AntigravityExecutor.execute()` and the SSE collector. */
export type ExecutorResult = {
  response: Response;
  url: string;
  headers: Record<string, string>;
  transformedBody: Record<string, unknown>;
};

export type AntigravityExecuteInput = {
  model: string;
  body: AntigravityRequestBody;
  stream: boolean;
  credentials: AntigravityCredentials;
  signal?: AbortSignal | null;
  log?: AntigravityLog;
  upstreamExtraHeaders?: Record<string, string> | null;
};

/** The executor surface the execute loop depends on (satisfied by AntigravityExecutor). */
export type AntigravityRuntime = {
  getFallbackCount(): number;
  /** Effective upstream timeout (ms) — provider override or FETCH_TIMEOUT_MS. */
  getRequestTimeoutMs(): number;
  buildUrl(model: string, stream: boolean, urlIndex?: number): string;
  buildHeaders(credentials: AntigravityCredentials, stream?: boolean): Record<string, string>;
  transformRequest(
    model: string,
    body: AntigravityRequestBody,
    stream: boolean,
    credentials: AntigravityCredentials,
    log?: AntigravityLog
  ): Promise<Record<string, unknown> | Response>;
  shouldRetry(status: number, urlIndex: number): boolean;
  collectStreamToResponse(
    response: Response,
    model: string,
    url: string,
    headers: Record<string, string>,
    transformedBody: Record<string, unknown>,
    log?: AntigravityLog,
    signal?: AbortSignal | null
  ): Promise<ExecutorResult>;
};
