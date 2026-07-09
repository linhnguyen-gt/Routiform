import { fisherYatesShuffle, getNextFromDeck } from "../../../src/shared/utils/shuffleDeck";
import { parseModel } from "../model.ts";
import { recordComboIntent } from "../comboMetrics.ts";
import { classifyWithConfig } from "../intentClassifier.ts";
import { selectProvider as selectAutoProvider } from "../autoCombo/engine.ts";
import { selectWithStrategy } from "../autoCombo/routerStrategy.ts";
import {
  DEFAULT_WEIGHTS,
  scorePool,
  type ScoringWeights,
  type ProviderCandidate,
} from "../autoCombo/scoring.ts";
import { supportsToolCalling } from "../modelCapabilities.ts";
import { buildAutoCandidates } from "./combo-auto-candidates.ts";
import { getIntentConfig, mapIntentToTaskType } from "./combo-intent-helpers.ts";
import { extractPromptForIntent } from "./combo-prompt-text.ts";
import {
  sortModelsByContextSize,
  sortModelsByCost,
  sortModelsByUsage,
} from "./combo-sort-models.ts";
import {
  orderModelsByHeadroom,
  orderModelsByLkgp,
  orderModelsByP2c,
} from "./combo-strategy-orderers.ts";

type LogLike = {
  info: (tag: string, msg: string, meta?: unknown) => void;
  warn: (tag: string, msg: string, meta?: unknown) => void;
};

/** Apply strategy-specific ordering (auto, random, cost-optimized, etc.). */
export async function applyStrategyOrdering(
  orderedModels: string[],
  params: {
    strategy: string;
    body: { tools?: unknown[]; stream?: boolean } & Record<string, unknown>;
    combo: Record<string, unknown> & { name: string; id?: string; system_message?: string };
    settings?: Record<string, unknown>;
    log: LogLike;
  }
): Promise<string[]> {
  const { strategy, body, combo, settings, log } = params;
  let next = [...orderedModels];

  if (strategy === "auto") {
    const requestHasTools = Array.isArray(body?.tools) && body.tools.length > 0;
    let eligibleModels = [...next];

    if (requestHasTools) {
      const filtered = eligibleModels.filter((m) => supportsToolCalling(m));
      if (filtered.length > 0) {
        eligibleModels = filtered;
      } else {
        log.warn(
          "COMBO",
          "Auto strategy: all candidates filtered by tool-calling policy, falling back to full pool"
        );
      }
    }

    const prompt = extractPromptForIntent(body);
    const systemPrompt =
      typeof combo?.system_message === "string" ? combo.system_message : undefined;
    const intentConfig = getIntentConfig(settings, combo);
    const intent = classifyWithConfig(prompt, intentConfig, systemPrompt);
    recordComboIntent(combo.name, intent);
    const taskType = mapIntentToTaskType(intent);

    const autoConfigSource =
      (combo as { autoConfig?: Record<string, unknown>; config?: Record<string, unknown> })
        .autoConfig ||
      (combo as { config?: { auto?: Record<string, unknown> } }).config?.auto ||
      (combo as { config?: Record<string, unknown> }).config ||
      {};
    const routingStrategy =
      typeof autoConfigSource.routingStrategy === "string"
        ? autoConfigSource.routingStrategy
        : typeof autoConfigSource.strategyName === "string"
          ? autoConfigSource.strategyName
          : "rules";

    const candidatePool = Array.isArray(autoConfigSource.candidatePool)
      ? autoConfigSource.candidatePool
      : [
          ...new Set(
            eligibleModels.map((m) => {
              const parsed = parseModel(m);
              return parsed.provider || parsed.providerAlias || "unknown";
            })
          ),
        ];

    const weights: ScoringWeights =
      autoConfigSource.weights && typeof autoConfigSource.weights === "object"
        ? (autoConfigSource.weights as ScoringWeights)
        : DEFAULT_WEIGHTS;
    const explorationRate = Number.isFinite(Number(autoConfigSource.explorationRate))
      ? Number(autoConfigSource.explorationRate)
      : 0.05;
    const budgetCap = Number.isFinite(Number(autoConfigSource.budgetCap))
      ? Number(autoConfigSource.budgetCap)
      : undefined;
    const modePack =
      typeof autoConfigSource.modePack === "string" ? autoConfigSource.modePack : undefined;

    let lastKnownGoodProvider: string | undefined;
    try {
      const { getLKGP } = await import("../../../src/lib/localDb");
      const lkgp = await getLKGP(combo.name, combo.id || combo.name);
      if (lkgp) lastKnownGoodProvider = lkgp;
    } catch (err) {
      log.warn("COMBO", "Failed to retrieve Last Known Good Provider. This is non-fatal.", { err });
    }

    const candidates: ProviderCandidate[] = await buildAutoCandidates(eligibleModels, combo.name);
    if (candidates.length > 0) {
      let selectedProvider: string | null = null;
      let selectedModel: string | null = null;
      let selectionReason = "";

      if (routingStrategy !== "rules") {
        try {
          const decision = selectWithStrategy(
            candidates,
            { taskType, requestHasTools, lastKnownGoodProvider },
            routingStrategy
          );
          selectedProvider = decision.provider;
          selectedModel = decision.model;
          selectionReason = decision.reason;
        } catch (err: unknown) {
          log.warn(
            "COMBO",
            `Auto strategy '${routingStrategy}' failed (${(err as Error)?.message || "unknown"}), falling back to rules`
          );
        }
      }

      if (!selectedProvider || !selectedModel) {
        const selection = selectAutoProvider(
          {
            id: combo.id || combo.name,
            name: combo.name,
            type: "auto",
            candidatePool,
            weights,
            modePack,
            budgetCap,
            explorationRate,
          },
          candidates,
          taskType
        );
        selectedProvider = selection.provider;
        selectedModel = selection.model;
        selectionReason = `score=${selection.score.toFixed(3)}${selection.isExploration ? " (exploration)" : ""}`;
      }

      const modelLookup = new Map<string, string>();
      for (const modelStr of eligibleModels) {
        const parsed = parseModel(modelStr);
        const provider = parsed.provider || parsed.providerAlias || "unknown";
        const modelId = parsed.model || modelStr;
        modelLookup.set(`${provider}/${modelId}`, modelStr);
      }

      const ranked = scorePool(candidates, taskType, weights)
        .map((r) => modelLookup.get(`${r.provider}/${r.model}`) || `${r.provider}/${r.model}`)
        .filter(Boolean) as string[];

      const selectedModelStr =
        modelLookup.get(`${selectedProvider}/${selectedModel}`) ||
        `${selectedProvider}/${selectedModel}`;
      next = [...new Set([selectedModelStr, ...ranked, ...eligibleModels])];

      log.info(
        "COMBO",
        `Auto selection: ${selectedModelStr} | intent=${intent} task=${taskType} | strategy=${routingStrategy} | ${selectionReason}`
      );
    } else {
      log.warn("COMBO", "Auto strategy has no candidates, keeping default ordering");
    }
  } else if (strategy === "lkgp") {
    try {
      const { getLKGP } = await import("../../../src/lib/localDb");
      const lkgpProvider = await getLKGP(combo.name, combo.id || combo.name);
      const providerId =
        typeof lkgpProvider === "string"
          ? lkgpProvider
          : lkgpProvider &&
              typeof lkgpProvider === "object" &&
              "provider" in (lkgpProvider as object)
            ? String((lkgpProvider as { provider?: string }).provider || "")
            : null;
      if (providerId) {
        const before = next[0];
        next = orderModelsByLkgp(next, providerId);
        if (next[0] !== before) {
          log.info(
            "COMBO",
            `[LKGP] Prioritizing last known good provider ${providerId} for combo "${combo.name}" → ${next[0]}`
          );
        } else {
          log.info(
            "COMBO",
            `[LKGP] Last known good provider ${providerId} already first for combo "${combo.name}"`
          );
        }
      }
    } catch (err) {
      log.warn("COMBO", "Failed to retrieve Last Known Good Provider. This is non-fatal.", { err });
    }
  } else if (strategy === "fill-first") {
    // Preserve configured priority order; drain each model before the next.
    log.info("COMBO", `Fill-first ordering: preserving priority order (${next.length} models)`);
  } else if (strategy === "strict-random") {
    const selectedId = await getNextFromDeck(`combo:${combo.name}`, next);
    const rest = next.filter((m) => m !== selectedId);
    next = [selectedId, ...rest];
    log.info("COMBO", `Strict-random deck: ${selectedId} selected (${next.length} models)`);
  } else if (strategy === "random") {
    next = fisherYatesShuffle([...next]);
    log.info("COMBO", `Random shuffle: ${next.length} models`);
  } else if (strategy === "p2c") {
    next = orderModelsByP2c(next, combo.name);
    log.info("COMBO", `Power-of-two-choices ordering: selected ${next[0]}`);
  } else if (strategy === "least-used") {
    next = sortModelsByUsage(next, combo.name);
    log.info("COMBO", `Least-used ordering: ${next[0]} has fewest requests`);
  } else if (strategy === "headroom") {
    next = orderModelsByHeadroom(next, combo.name);
    log.info("COMBO", `Headroom ordering: ${next[0]} has most free capacity (usage proxy)`);
  } else if (strategy === "cost-optimized") {
    next = await sortModelsByCost(next);
    log.info("COMBO", `Cost-optimized ordering: cheapest first (${next[0]})`);
  } else if (strategy === "context-optimized") {
    next = sortModelsByContextSize(next, combo as { context_length?: number });
    log.info("COMBO", `Context-optimized ordering: largest first (${next[0]})`);
  }

  return next;
}
