/**
 * Shared types for the Kiro executor modules.
 *
 * @module executors/kiro/types
 */

export type JsonRecord = Record<string, unknown>;

export type UsageSummary = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type KiroStreamState = {
  endDetected: boolean;
  finishEmitted: boolean;
  hasToolCalls: boolean;
  toolCallIndex: number;
  seenToolIds: Map<string, number>;
  totalContentLength?: number;
  contextUsagePercentage?: number;
  hasContextUsage?: boolean;
  hasMeteringEvent?: boolean;
  /** messageStopEvent arrived — the finish chunk can be emitted once usage settles. */
  messageStopSeen?: boolean;
  usage?: UsageSummary;
  /** Carry buffer for stripThinkingTags — a <thinking>/</thinking>/``` marker can straddle events. */
  thinkingBuffer: string;
  /** True while inside an unterminated <thinking>...</thinking> span. */
  thinkingInTag: boolean;
  /** True while inside a fenced code block (```...```) — <thinking> markers here are literal text. */
  inCodeFence: boolean;
};

export type EventFrame = {
  headers: Record<string, string>;
  payload: JsonRecord | null;
};

/** Mutable per-stream runtime shared by the event handlers (SSE chunk identity + stream state). */
export type KiroStreamRuntime = {
  responseId: string;
  created: number;
  model: string;
  chunkIndex: number;
  state: KiroStreamState;
};
