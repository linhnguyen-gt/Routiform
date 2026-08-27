import { initState } from "../../translator/index.ts";

export type JsonRecord = Record<string, unknown>;

export type StreamLogger = {
  appendProviderChunk?: (value: string) => void;
  appendConvertedChunk?: (value: string) => void;
  appendOpenAIChunk?: (value: string) => void;
};

export type StreamCompletePayload = {
  status: number;
  usage: unknown;
  /** Minimal response body for call log (streaming: usage + note; non-streaming not used) */
  responseBody?: unknown;
  providerPayload?: unknown;
  clientPayload?: unknown;
};

export type StreamOptions = {
  mode?: string;
  targetFormat?: string;
  sourceFormat?: string;
  provider?: string | null;
  reqLogger?: StreamLogger | null;
  toolNameMap?: unknown;
  model?: string | null;
  connectionId?: string | null;
  apiKeyInfo?: unknown;
  body?: unknown;
  onComplete?: ((payload: StreamCompletePayload) => void) | null;
  /**
   * Override `STREAM_IDLE_TIMEOUT_MS` for this stream only (e.g. unit tests).
   * When omitted, uses `STREAM_IDLE_TIMEOUT_MS` from env / runtime defaults.
   */
  idleTimeoutMs?: number | null;
};

export type TranslateState = ReturnType<typeof initState> & {
  provider?: string | null;
  toolNameMap?: unknown;
  usage?: unknown;
  finishReason?: unknown;
  /** Accumulated message content for call log response body */
  accumulatedContent?: string;
};

export type ToolCall = {
  id: string | null;
  index: number;
  type: string;
  function: { name: string; arguments: string };
};

export type UsageTokenRecord = Record<string, number | boolean | Record<string, number>>;
