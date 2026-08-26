/**
 * Auto-Combo Engine — The `auto` combo type that self-manages provider selection.
 *
 * Features:
 *   - Scoring-based provider selection from candidate pool
 *   - Bandit exploration (configurable rate, default 5%)
 *   - Budget cap enforcement
 *   - Self-healing integration
 *   - Mode pack support
 */

import {
  scorePool,
  validateWeights,
  DEFAULT_WEIGHTS,
  type ScoringWeights,
  type ProviderCandidate,
  type ScoredProvider,
} from "./scoring";
import { getTaskFitness } from "./taskFitness";
import { getModePack } from "./modePacks";
import { getSelfHealingManager } from "./selfHealing";
import { classifyPromptIntent } from "../intentClassifier";

export interface AutoComboConfig {
  id: string;
  name: string;
  type: "auto";
  candidatePool: string[]; // provider names (empty = all)
  weights: ScoringWeights;
  modePack?: string;
  budgetCap?: number; // max cost per request in USD
  explorationRate: number; // 0.05 = 5% exploratory
  /** If set, RouterStrategy name to use for selection ('rules' | 'cost' | 'latency') */
  routerStrategy?: string;
}

export interface SelectionResult {
  provider: string;
  model: string;
  score: number;
  isExploration: boolean;
  factors: Record<string, number>;
  excluded: string[];
}

/**
 * Select the best provider from an auto-combo pool.
 *
 * @param config - AutoCombo configuration
 * @param candidates - Provider candidates to score
 * @param taskType - Task type hint. When "default" or omitted, the engine will attempt
 *   to infer the intent from `promptMessages` using multilingual classification.
 * @param promptMessages - Optional raw messages for intent classification
 */
export function selectProvider(
  config: AutoComboConfig,
  candidates: ProviderCandidate[],
  taskType: string = "default",
  promptMessages?: Array<{ role: string; content: unknown }>
): SelectionResult {
  const healer = getSelfHealingManager();

  // ── Intent classification (ClawRouter Feature #10/11) ────────────────────
  // When taskType is generic ('default'), attempt to classify the prompt intent
  // using the multilingual intentClassifier for better task fitness scoring.
  let effectiveTaskType = taskType;
  if ((taskType === "default" || taskType === "") && promptMessages?.length) {
    // Extract text from last user message for classification
    const lastUserMsg = [...promptMessages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      const text =
        typeof lastUserMsg.content === "string"
          ? lastUserMsg.content
          : Array.isArray(lastUserMsg.content)
            ? (lastUserMsg.content as Array<{ type: string; text?: string }>)
                .filter((b) => b.type === "text")
                .map((b) => b.text || "")
                .join(" ")
            : "";
      if (text.length > 10) {
        const intent = classifyPromptIntent(text);
        effectiveTaskType = intent; // 'code' | 'reasoning' | 'simple' | 'medium'
      }
    }
  }
  // Resolve weights from mode pack or config
  let weights = config.weights;
  if (config.modePack) {
    const pack = getModePack(config.modePack);
    if (pack) weights = pack;
  }
  if (!validateWeights(weights)) weights = DEFAULT_WEIGHTS;

  // Filter out excluded providers
  const excluded: string[] = [];
  const pool = candidates.filter((c) => {
    // Pool filter
    if (config.candidatePool.length > 0 && !config.candidatePool.includes(c.provider)) return false;

    // Self-healing exclusion — read-only at selection time. The old code
    // called healer.evaluate(provider, 0.5, cbState) here: a hardcoded score,
    // and a stateful call that inflated probeCount on every selection for
    // HALF_OPEN breakers.
    const exclusion = healer.checkExcluded(c.provider, c.circuitBreakerState);
    if (exclusion.excluded) {
      excluded.push(c.provider);
      return false;
    }
    return true;
  });

  if (pool.length === 0) {
    // Fallback: allow all candidates regardless of exclusions
    pool.push(...candidates);
    excluded.length = 0;
  }

  // Score all providers (using classified intent if available)
  const scored = scorePool(pool, effectiveTaskType, weights, getTaskFitness);

  // Stateful self-healing pass with ACTUAL computed scores — the one place
  // selection may mutate healer state (new exclusions for low scores,
  // re-admission after cooldown). "CLOSED" is passed deliberately: probe
  // counting must only ever happen on real probe requests.
  const finalCandidates = scored.filter((s) => {
    const eval_ = healer.evaluate(s.provider, s.score, "CLOSED");
    if (eval_.excluded) {
      excluded.push(s.provider);
      return false;
    }
    return true;
  });

  const candidates_ = finalCandidates.length > 0 ? finalCandidates : scored;

  // Incident mode check
  const incidentMode = healer.isInIncidentMode();
  const effectiveExplorationRate = incidentMode ? 0 : config.explorationRate;

  // Selection: exploration vs exploitation
  let selected: ScoredProvider;
  const isExploration = Math.random() < effectiveExplorationRate && candidates_.length > 1;

  if (isExploration) {
    // Random selection (bandit exploration)
    const idx = Math.floor(Math.random() * candidates_.length);
    selected = candidates_[idx];
  } else {
    // Greedy: highest score
    selected = candidates_[0];
  }

  // Budget cap enforcement
  if (config.budgetCap) {
    const candidate = candidates.find((c) => c.provider === selected.provider);
    if (candidate) {
      const estimatedCost = (candidate.costPer1MTokens / 1_000_000) * 1000; // approx for 1K tokens
      if (estimatedCost > config.budgetCap) {
        // Degrade to cheapest
        const cheapest = candidates_
          .map((s) => ({
            ...s,
            cost: candidates.find((c) => c.provider === s.provider)?.costPer1MTokens || 0,
          }))
          .sort((a, b) => a.cost - b.cost)[0];
        if (cheapest) selected = cheapest;
      }
    }
  }

  return {
    provider: selected.provider,
    model: selected.model,
    score: selected.score,
    isExploration,
    factors: selected.factors as unknown as Record<string, number>,
    excluded,
  };
}

// ============ Auto-Combo Config Schema Reference ============
// Note: AutoCombos are now persisted natively in the SQLite DB via src/lib/db/combos.ts
// using the combo.strategy = "auto" | "lkgp" type, with parameters nested inside combo.config
