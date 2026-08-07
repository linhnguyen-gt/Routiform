import { ROUTING_STRATEGIES } from "@/shared/constants/routingStrategies";
import type { ComboTemplate } from "./combo-template-types";

export const VALID_NAME_REGEX = /^[a-zA-Z0-9_/.-]+$/;

export const STRATEGY_OPTIONS = ROUTING_STRATEGIES.map((strategy) => ({
  value: strategy.value,
  labelKey: strategy.labelKey,
  descKey: strategy.combosDescKey,
  icon: strategy.icon,
}));

export const STRATEGY_GUIDANCE_FALLBACK: Record<
  string,
  { when: string; avoid: string; example: string }
> = {
  priority: {
    when: "Use when you have one preferred model and only want fallback on failure.",
    avoid: "Avoid when you need balanced load between models.",
    example: "Example: Primary coding model with cheaper backup for outages.",
  },
  weighted: {
    when: "Use when you need controlled traffic split across models.",
    avoid: "Avoid when weights are not maintained or you need strict fairness.",
    example: "Example: 80% stable model and 20% canary model for safe rollout.",
  },
  "round-robin": {
    when: "Use when you need predictable, even request distribution.",
    avoid: "Avoid when model latency/cost differs significantly.",
    example: "Example: Same model across multiple accounts to spread throughput.",
  },
  random: {
    when: "Use when you want a simple spread with low configuration effort.",
    avoid: "Avoid when requests must be distributed with strict guarantees.",
    example: "Example: Prototyping with equivalent models and no traffic policy.",
  },
  "least-used": {
    when: "Use when you want adaptive balancing based on recent demand.",
    avoid: "Avoid when your traffic is too low to benefit from usage balancing.",
    example: "Example: Mixed workloads where one model tends to get overloaded.",
  },
  "cost-optimized": {
    when: "Use when minimizing cost is the top priority.",
    avoid: "Avoid when pricing data is missing or outdated.",
    example: "Example: Batch or background jobs where lower cost matters most.",
  },
  "fill-first": {
    when: "Use when you want to drain one provider's quota fully before moving to the next.",
    avoid: "Avoid when you need request-level load balancing across providers.",
    example: "Example: Use all $200 Deepgram credits before falling to Groq.",
  },
  p2c: {
    when: "Use when you want low-latency selection using Power-of-Two-Choices algorithm.",
    avoid: "Avoid for small combos with 2 or fewer models — no benefit over round-robin.",
    example: "Example: High-throughput inference across 4+ equivalent model endpoints.",
  },
  "strict-random": {
    when: "Use when you want perfectly even spread — each model used once before repeating.",
    avoid: "Avoid when models have different quality or latency and order matters.",
    example: "Example: Multiple accounts of the same model to distribute usage evenly.",
  },
  auto: {
    when: "Use when you have one preferred model and only want fallback on failure.",
    avoid: "Avoid when you need balanced load between models.",
    example: "Example: Primary coding model with cheaper backup for outages.",
  },
  lkgp: {
    when: "Use when you have one preferred model and only want fallback on failure.",
    avoid: "Avoid when you need balanced load between models.",
    example: "Example: Primary coding model with cheaper backup for outages.",
  },
  "context-optimized": {
    when: "Use when you have one preferred model and only want fallback on failure.",
    avoid: "Avoid when you need balanced load between models.",
    example: "Example: Primary coding model with cheaper backup for outages.",
  },
};

export const ADVANCED_FIELD_HELP_FALLBACK = {
  maxRetries: "How many retries are attempted before failing the request.",
  requestRetry: "Explicit retry attempts for transient failures (preferred over maxRetries).",
  retryDelay: "Initial delay between retries. Higher values reduce burst pressure.",
  maxRetryIntervalSec: "Upper bound in seconds for each retry wait interval.",
  timeout: "Maximum request time before aborting. Set higher for long generations.",
  healthcheck: "Skips unhealthy models/providers from routing decisions when enabled.",
  concurrencyPerModel: "Max simultaneous requests sent to each model in round-robin.",
  queueTimeout: "How long a request can wait in queue before timeout in round-robin.",
};

export const STRATEGY_RECOMMENDATIONS_FALLBACK: Record<
  string,
  { title: string; description: string; tips: string[] }
> = {
  priority: {
    title: "Fail-safe baseline",
    description: "Use one primary model and keep fallback chain short and reliable.",
    tips: [
      "Put your most reliable model first.",
      "Keep 1-2 backup models with similar quality.",
      "Use safe retries to absorb transient provider failures.",
    ],
  },
  weighted: {
    title: "Controlled traffic split",
    description: "Great for canary rollouts and gradual migration between models.",
    tips: [
      "Start with conservative split like 90/10.",
      "Keep the total at 100% and auto-balance after changes.",
      "Monitor success and latency before increasing canary weight.",
    ],
  },
  "round-robin": {
    title: "Predictable load sharing",
    description: "Best when models are equivalent and you need smooth distribution.",
    tips: [
      "Use at least 2 models.",
      "Set concurrency limits to avoid burst overload.",
      "Use queue timeout to fail fast under saturation.",
    ],
  },
  random: {
    title: "Quick spread with low setup",
    description: "Use when you need simple distribution without strict guarantees.",
    tips: [
      "Use models with similar latency profiles.",
      "Keep retries enabled to absorb random misses.",
      "Prefer this for experimentation, not strict SLAs.",
    ],
  },
  "least-used": {
    title: "Adaptive balancing",
    description: "Routes to less-used models to reduce hotspots over time.",
    tips: [
      "Works better under continuous traffic.",
      "Combine with health checks for safer balancing.",
      "Track per-model usage to validate distribution gains.",
    ],
  },
  "cost-optimized": {
    title: "Budget-first routing",
    description: "Routes to lower-cost models when pricing metadata is available.",
    tips: [
      "Ensure pricing coverage for all selected models.",
      "Keep a quality fallback for hard prompts.",
      "Use for batch/background jobs where cost is the main KPI.",
    ],
  },
  "fill-first": {
    title: "Quota drain strategy",
    description: "Exhausts one provider's quota before moving to the next in chain.",
    tips: [
      "Order models by free quota size — biggest first.",
      "Enable health checks to skip drained providers.",
      "Ideal for free-tier stacking (Deepgram → Groq → NIM).",
    ],
  },
  p2c: {
    title: "Power-of-Two-Choices",
    description:
      "Picks the less-loaded of two random candidates per request — low latency at scale.",
    tips: [
      "Use with 4+ models for best effect.",
      "Requires latency telemetry enabled in Settings.",
      "Great replacement for round-robin in high-throughput combos.",
    ],
  },
  "strict-random": {
    title: "Shuffle deck distribution",
    description: "Each model is used exactly once per cycle before reshuffling.",
    tips: [
      "Use at least 2 models for meaningful distribution.",
      "Ideal for same-model accounts to evenly spread quota.",
      "Guarantees no model is skipped or repeated within a cycle.",
    ],
  },
  auto: {
    title: "Fail-safe baseline",
    description: "Use one primary model and keep fallback chain short and reliable.",
    tips: [
      "Put your most reliable model first.",
      "Keep 1-2 backup models with similar quality.",
      "Use safe retries to absorb transient provider failures.",
    ],
  },
  lkgp: {
    title: "Fail-safe baseline",
    description: "Use one primary model and keep fallback chain short and reliable.",
    tips: [
      "Put your most reliable model first.",
      "Keep 1-2 backup models with similar quality.",
      "Use safe retries to absorb transient provider failures.",
    ],
  },
  "context-optimized": {
    title: "Fail-safe baseline",
    description: "Use one primary model and keep fallback chain short and reliable.",
    tips: [
      "Put your most reliable model first.",
      "Keep 1-2 backup models with similar quality.",
      "Use safe retries to absorb transient provider failures.",
    ],
  },
};

export const COMBO_USAGE_GUIDE_STORAGE_KEY = "routiform:combos:hide-usage-guide";

export const COMBO_TEMPLATE_FALLBACK = {
  title: "Quick templates",
  description: "Apply a starting profile, then adjust models and config.",
  apply: "Apply template",
  highAvailabilityTitle: "High availability",
  highAvailabilityDesc: "Priority routing with health checks and safe retries.",
  costSaverTitle: "Cost saver",
  costSaverDesc: "Cost-optimized routing for budget-first workloads.",
  balancedTitle: "Balanced load",
  balancedDesc: "Least-used routing to spread demand over time.",
  freeStackTitle: "Free & free-tier stack",
  freeStackDesc:
    "Round-robin across your free and free-tier providers. Metered keys are marked — a paid plan may still bill.",
  paidPremiumTitle: "Paid Premium",
  paidPremiumDesc:
    "Round-robin across your paid subscription providers. Top-tier models, distributed load.",
};

/**
 * Templates are declarative INTENT, resolved at runtime against the user's real
 * connected providers by `combo-template-resolver.ts`. They deliberately carry no model
 * list — the previous hardcoded arrays named a provider that does not exist (`if`), a
 * deprecated one, and a model id absent from NVIDIA's catalog.
 *
 * None of them is visually promoted, on purpose: a template's content is user-dependent,
 * so a static hero badge would be an unfounded promise about a card whose contents we
 * cannot predict. Honest promotion would be dynamic — highlight a template only when it
 * actually resolves for that user — and is follow-up work, not a polish pass.
 */
export const COMBO_TEMPLATES: ComboTemplate[] = [
  {
    id: "free-stack",
    icon: "volunteer_activism",
    titleKey: "templateFreeStack",
    descKey: "templateFreeStackDesc",
    fallbackTitle: COMBO_TEMPLATE_FALLBACK.freeStackTitle,
    fallbackDesc: COMBO_TEMPLATE_FALLBACK.freeStackDesc,
    strategy: "round-robin",
    suggestedName: "free-stack",
    config: {
      maxRetries: 3,
      retryDelayMs: 500,
      healthCheckEnabled: true,
    },
    selector: {
      providerFilter: "free",
      ranking: "free-tier",
      // round-robin with one model trips the readiness warning; require two.
      minModels: 2,
      maxModels: 8,
      maxPerProvider: 2,
      weightMode: "zero",
    },
  },
  {
    id: "high-availability",
    icon: "shield",
    titleKey: "templateHighAvailability",
    descKey: "templateHighAvailabilityDesc",
    fallbackTitle: COMBO_TEMPLATE_FALLBACK.highAvailabilityTitle,
    fallbackDesc: COMBO_TEMPLATE_FALLBACK.highAvailabilityDesc,
    strategy: "priority",
    suggestedName: "high-availability",
    config: {
      maxRetries: 2,
      retryDelayMs: 1500,
      healthCheckEnabled: true,
    },
    selector: {
      providerFilter: "any",
      ranking: "fitness-desc",
      minModels: 1,
      maxModels: 6,
      maxPerProvider: 1,
      weightMode: "zero",
    },
  },
  {
    id: "cost-saver",
    icon: "savings",
    titleKey: "templateCostSaver",
    descKey: "templateCostSaverDesc",
    fallbackTitle: COMBO_TEMPLATE_FALLBACK.costSaverTitle,
    fallbackDesc: COMBO_TEMPLATE_FALLBACK.costSaverDesc,
    strategy: "cost-optimized",
    suggestedName: "cost-saver",
    config: {
      maxRetries: 1,
      retryDelayMs: 500,
      healthCheckEnabled: true,
    },
    selector: {
      // "priced only" — cost-optimized with zero priced models is save-blocked.
      providerFilter: "priced",
      ranking: "price-asc",
      minModels: 1,
      maxModels: 5,
      maxPerProvider: 2,
      weightMode: "zero",
    },
  },
  {
    id: "balanced",
    icon: "balance",
    titleKey: "templateBalanced",
    descKey: "templateBalancedDesc",
    fallbackTitle: COMBO_TEMPLATE_FALLBACK.balancedTitle,
    fallbackDesc: COMBO_TEMPLATE_FALLBACK.balancedDesc,
    strategy: "least-used",
    suggestedName: "balanced-load",
    config: {
      maxRetries: 1,
      retryDelayMs: 1000,
      healthCheckEnabled: true,
    },
    selector: {
      providerFilter: "any",
      ranking: "spread",
      minModels: 1,
      maxModels: 6,
      maxPerProvider: 1,
      weightMode: "zero",
    },
  },
  {
    id: "paid-premium",
    icon: "workspace_premium",
    titleKey: "templatePaidPremium",
    descKey: "templatePaidPremiumDesc",
    fallbackTitle: COMBO_TEMPLATE_FALLBACK.paidPremiumTitle,
    fallbackDesc: COMBO_TEMPLATE_FALLBACK.paidPremiumDesc,
    strategy: "round-robin",
    suggestedName: "paid-premium",
    config: {
      maxRetries: 2,
      retryDelayMs: 1000,
      healthCheckEnabled: true,
    },
    selector: {
      providerFilter: "paid-subscription",
      ranking: "fitness-desc",
      minModels: 2,
      maxModels: 6,
      maxPerProvider: 2,
      weightMode: "zero",
    },
  },
];
