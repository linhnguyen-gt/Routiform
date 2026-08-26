/**
 * Emergency Fallback — Budget Exhaustion Redirect
 *
 * When a request fails due to budget exhaustion (HTTP 402 or budget keywords
 * in the error body), optionally redirect to a free-tier model
 * (default provider/model: nvidia + openai/gpt-oss-120b at $0.00/M tokens).
 *
 * Inspired by ClawRouter: "gpt-oss-120b costs nothing and serves as
 * automatic fallback when wallet is empty."
 */

import { CREDITS_EXHAUSTED_SIGNALS } from "./accountFallback.ts";

// Additions beyond CREDITS_EXHAUSTED_SIGNALS that budget fallback relies on.
// The Portuguese variants matter because Brazilian resellers surface them.
const EXTRA_BUDGET_KEYWORDS = [
  "insufficient funds",
  "insufficient_funds",
  "budget exceeded",
  "budget_exceeded",
  "quota exceeded",
  "quota_exceeded",
  "billing",
  "no credits",
  "credit limit",
  "spending limit",
  "saldo insuficiente",
  "limite de gastos",
  "cota excedida",
];


export interface EmergencyFallbackConfig {
  enabled: boolean;
  provider: string;
  model: string;
  triggerOn402: boolean;
  triggerOnBudgetKeywords: boolean;
  budgetKeywords: string[];
  /** Skip fallback for tool requests (gpt-oss-120b may not support structured tool calling) */
  skipForToolRequests: boolean;
  maxOutputTokens: number;
}

export const EMERGENCY_FALLBACK_CONFIG: EmergencyFallbackConfig = {
  enabled: true,
  provider: "nvidia",
  model: "openai/gpt-oss-120b",
  triggerOn402: true,
  triggerOnBudgetKeywords: true,
  // Derived from the canonical credits-exhausted signals plus the extras this
  // fallback has always matched — one source of truth for budget detection.
  budgetKeywords: [...CREDITS_EXHAUSTED_SIGNALS, ...EXTRA_BUDGET_KEYWORDS],
  skipForToolRequests: true,
  maxOutputTokens: 4096,
};

export interface FallbackDecision {
  shouldFallback: true;
  reason: string;
  provider: string;
  model: string;
  maxOutputTokens: number;
}

export interface NoFallbackDecision {
  shouldFallback: false;
  reason: string;
}

export type FallbackResult = FallbackDecision | NoFallbackDecision;

export function shouldUseFallback(
  status: number,
  errorBody: string,
  requestHasTools: boolean,
  config: EmergencyFallbackConfig = EMERGENCY_FALLBACK_CONFIG
): FallbackResult {
  if (!config.enabled) return { shouldFallback: false, reason: "emergency fallback disabled" };
  if (config.skipForToolRequests && requestHasTools) {
    return { shouldFallback: false, reason: "skipped: request has tools" };
  }
  if (config.triggerOn402 && status === 402) {
    return {
      shouldFallback: true,
      reason: `HTTP 402 → emergency fallback to ${config.provider}/${config.model}`,
      provider: config.provider,
      model: config.model,
      maxOutputTokens: config.maxOutputTokens,
    };
  }
  if (config.triggerOnBudgetKeywords && errorBody) {
    const lowerBody = errorBody.toLowerCase();
    const matched = config.budgetKeywords.find((kw) => lowerBody.includes(kw.toLowerCase()));
    if (matched) {
      return {
        shouldFallback: true,
        reason: `Budget error detected ('${matched}') → emergency fallback to ${config.provider}/${config.model}`,
        provider: config.provider,
        model: config.model,
        maxOutputTokens: config.maxOutputTokens,
      };
    }
  }
  return { shouldFallback: false, reason: "no budget error detected" };
}

export function isFallbackDecision(result: FallbackResult): result is FallbackDecision {
  return result.shouldFallback === true;
}
