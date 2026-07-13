/**
 * Cost Calculator — extracted from usageDb.js (T-15)
 *
 * Pure function for calculating request cost based on model pricing.
 * No DB interaction — pricing is fetched from localDb.
 *
 * @module lib/usage/costCalculator
 */

import { normalizeTokensForCost } from "./tokenAccounting";

/**
 * Normalize model name — strip provider path prefixes.
 * Examples:
 *   "openai/gpt-oss-120b" → "gpt-oss-120b"
 *   "accounts/fireworks/models/gpt-oss-120b" → "gpt-oss-120b"
 *   "deepseek-ai/DeepSeek-R1" → "DeepSeek-R1"
 *   "gpt-oss-120b" → "gpt-oss-120b" (no-op)
 *
 * @param {string} model
 * @returns {string}
 */
export function normalizeModelName(model) {
  if (!model || !model.includes("/")) return model;
  const parts = model.split("/");
  return parts[parts.length - 1];
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/**
 * Calculate cost for a usage entry.
 *
 * @param {string} provider
 * @param {string} model
 * @param {Object} tokens
 * @returns {Promise<number>} Cost in USD
 */
export async function calculateCost(provider, model, tokens) {
  if (!tokens || !provider || !model) return 0;

  try {
    const { getPricingForModel } = await import("@/lib/localDb");

    // Try exact match first, then normalized model name
    let pricing = await getPricingForModel(provider, model);
    if (!pricing) {
      const normalized = normalizeModelName(model);
      if (normalized !== model) {
        pricing = await getPricingForModel(provider, normalized);
      }
    }
    if (!pricing) return 0;

    return computeCostFromPricing(pricing, tokens);
  } catch (error) {
    console.error("Error calculating cost:", error);
    return 0;
  }
}

export function computeCostFromPricing(pricing: unknown, tokens: unknown): number {
  if (!pricing || !tokens) return 0;

  const pricingRecord =
    pricing && typeof pricing === "object" && !Array.isArray(pricing)
      ? (pricing as Record<string, unknown>)
      : {};

  const inputPrice = toNumber(pricingRecord.input, 0);
  const cachedPrice = toNumber(pricingRecord.cached, inputPrice);
  const outputPrice = toNumber(pricingRecord.output, 0);
  const reasoningPrice = toNumber(pricingRecord.reasoning, outputPrice);
  const cacheCreationPrice = toNumber(pricingRecord.cache_creation, inputPrice);

  // Resolve the raw, possibly-ambiguous token record into an unambiguous
  // canonical shape ONCE, at this boundary — see NormalizedCostTokens for why
  // reading prompt_tokens/input_tokens/input directly here is unsafe.
  const {
    nonCachedInputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    outputTokens,
    reasoningTokens,
  } = normalizeTokensForCost(tokens);

  let cost = 0;
  cost += nonCachedInputTokens * (inputPrice / 1000000);

  if (cacheReadTokens > 0) {
    cost += cacheReadTokens * (cachedPrice / 1000000);
  }

  cost += outputTokens * (outputPrice / 1000000);

  if (reasoningTokens > 0) {
    cost += reasoningTokens * (reasoningPrice / 1000000);
  }

  if (cacheCreationTokens > 0) {
    cost += cacheCreationTokens * (cacheCreationPrice / 1000000);
  }

  return cost;
}
