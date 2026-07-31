import { ccPricing, anthropicPricing } from "./pricing/anthropic-pricing";
import { cxPricing, openaiPricing } from "./pricing/openai-pricing";
import { geminiCliPricing, geminiPricing } from "./pricing/gemini-pricing";
import { qwPricing, ifPricing } from "./pricing/chinese-pricing";
import { agPricing } from "./pricing/ag-pricing";
import { ghPricing } from "./pricing/gh-pricing";
import { deepseekPricing, openrouterPricing } from "./pricing/deepseek-pricing";
import { glmPricing } from "./pricing/glm-pricing";
import { kimiPricing, kmcPricing, kmcaPricing } from "./pricing/kimi-pricing";
import { minimaxPricing } from "./pricing/minimax-pricing";
import {
  groqPricing,
  blackboxPricing,
  fireworksPricing,
  cerebrasPricing,
  nvidiaPricing,
  nebiusPricing,
  siliconflowPricing,
  hyperbolicPricing,
} from "./pricing/free-pricing";
import { xaiPricing, zaiPricing, kiroPricing } from "./pricing/other-pricing";

export const DEFAULT_PRICING: Record<string, Record<string, unknown>> = {
  cc: ccPricing,
  cx: cxPricing,
  "gemini-cli": geminiCliPricing,
  qw: qwPricing,
  if: ifPricing,
  ag: agPricing,
  gh: ghPricing,
  openai: openaiPricing,
  anthropic: anthropicPricing,
  gemini: geminiPricing,
  deepseek: deepseekPricing,
  openrouter: openrouterPricing,
  glm: glmPricing,
  kimi: kimiPricing,
  kmc: kmcPricing,
  kmca: kmcaPricing,
  minimax: minimaxPricing,
  groq: groqPricing,
  blackbox: blackboxPricing,
  fireworks: fireworksPricing,
  cerebras: cerebrasPricing,
  nvidia: nvidiaPricing,
  nebius: nebiusPricing,
  siliconflow: siliconflowPricing,
  hyperbolic: hyperbolicPricing,
  xai: xaiPricing,
  zai: zaiPricing,
  kiro: kiroPricing,
};

type ProviderPricingTable = Record<string, Record<string, unknown>>;

/**
 * Get pricing for a specific provider and model
 * @param {string} provider - Provider ID (e.g., "openai", "cc", "gemini-cli")
 * @param {string} model - Model ID
 * @returns {object|null} Pricing object or null if not found
 */
export function getPricingForModel(
  provider: string,
  model: string
): Record<string, unknown> | null {
  if (!provider || !model) return null;

  const providerPricing = (DEFAULT_PRICING as ProviderPricingTable)[provider];
  if (!providerPricing) return null;

  const modelPricing = providerPricing[model];
  if (!modelPricing || typeof modelPricing !== "object") return null;
  return modelPricing as Record<string, unknown>;
}

/**
 * Get all pricing data
 * @returns {object} All default pricing
 */
export function getDefaultPricing() {
  return DEFAULT_PRICING;
}

/**
 * Format cost for display
 * @param {number} cost - Cost in dollars
 * @returns {string} Formatted cost string
 */
export function formatCost(cost: number | null | undefined): string {
  if (cost === null || cost === undefined || isNaN(cost)) return "$0.00";
  return `$${cost.toFixed(2)}`;
}
export type { PricingRate } from "./pricing/base";
