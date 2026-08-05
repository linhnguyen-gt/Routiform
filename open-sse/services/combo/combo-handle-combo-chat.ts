import { unavailableResponse } from "../../utils/error.ts";
import { resolveComboConfig, getDefaultComboConfig } from "../comboConfig.ts";
import { applyComboAgentMiddleware } from "../comboAgentMiddleware.ts";
import { supportsToolCalling } from "../modelCapabilities.ts";
import { resolveRetrySettings } from "./combo-retry-settings.ts";
import { filterOrderedModelsForToolCalling } from "./combo-tool-calling-filter.ts";
import { createHandleSingleModelWrapped } from "./combo-handle-single-model-wrapped.ts";
import { resolveInitialOrderedModels } from "./combo-ordered-models-base.ts";
import { applyStrategyOrdering } from "./combo-ordered-models-strategy.ts";
import { partitionByImageSupport } from "./combo-image-partition.ts";
import { requestHasImage } from "../request-has-image.ts";
import { runStandardComboFallbackChain } from "./combo-standard-fallback-chain.ts";
import { handleRoundRobinCombo } from "./combo-round-robin.ts";

type LogLike = {
  info: (tag: string, msg: string, meta?: unknown) => void;
  warn: (tag: string, msg: string, meta?: unknown) => void;
};

/**
 * Handle combo chat with fallback.
 * Supports: priority, weighted, round-robin, random, least-used, cost-optimized, auto, etc.
 */
export async function handleComboChat(options: {
  body: { stream?: boolean; tools?: unknown[] } & Record<string, unknown>;
  combo: Record<string, unknown> & {
    name: string;
    id?: string;
    strategy?: string;
    models?: unknown[];
    requireToolCalling?: boolean;
    config?: Record<string, unknown>;
    context_cache_protection?: boolean;
    system_message?: string;
  };
  handleSingleModel: (body: unknown, modelStr: string) => Promise<Response>;
  isModelAvailable?: (modelStr: string) => Promise<boolean>;
  log: LogLike;
  settings?: Record<string, unknown>;
  allCombos?: unknown;
}): Promise<Response> {
  const { handleSingleModel, isModelAvailable, log, settings, allCombos } = options;
  let { body, combo } = options;
  const strategy = combo.strategy || "priority";
  const models = combo.models || [];

  const { body: agentBody, pinnedModel } = applyComboAgentMiddleware(body, combo, "");
  body = agentBody;
  if (pinnedModel) {
    log.info("COMBO", `[#401] Context caching: pinned model=${pinnedModel}`);
  }

  const handleSingleModelWrapped = createHandleSingleModelWrapped(combo, handleSingleModel, log);

  if (pinnedModel) {
    if (
      combo.requireToolCalling &&
      Array.isArray(body?.tools) &&
      body.tools.length > 0 &&
      !supportsToolCalling(pinnedModel)
    ) {
      return unavailableResponse(
        400,
        "Combo requireToolCalling: pinned model does not support tool calling"
      );
    }
    log.info(
      "COMBO",
      `Bypassing strategy — routing directly to pinned context model: ${pinnedModel}`
    );
    return handleSingleModelWrapped(body, pinnedModel);
  }

  if (strategy === "round-robin") {
    return handleRoundRobinCombo({
      body,
      combo,
      handleSingleModel: handleSingleModelWrapped,
      isModelAvailable,
      log,
      settings,
      allCombos,
    });
  }

  const config = settings
    ? resolveComboConfig(combo, settings)
    : { ...getDefaultComboConfig(), ...(combo.config || {}) };
  const { maxRetries, retryDelayMs } = resolveRetrySettings(config as Record<string, unknown>);

  let orderedModels = resolveInitialOrderedModels(combo, allCombos, strategy, models, log);
  orderedModels = await applyStrategyOrdering(orderedModels, {
    strategy,
    body,
    combo,
    settings,
    log,
  });

  if (orderedModels.length === 0) {
    return unavailableResponse(503, "Combo has no models");
  }

  orderedModels = filterOrderedModelsForToolCalling(orderedModels, combo, body, log);

  if (orderedModels.length === 0) {
    return unavailableResponse(
      400,
      "Combo requireToolCalling: no models in this combo support tool calling for this request"
    );
  }

  // Last ordering step, and only when the current turn actually carries an image: try candidates
  // whose translator carries images before the ones that silently drop them. Text traffic returns
  // the identical array, by reference.
  if (requestHasImage(body)) {
    orderedModels = partitionByImageSupport(orderedModels, log);
  }

  return runStandardComboFallbackChain({
    orderedModels,
    combo,
    body,
    strategy,
    handleSingleModelWrapped,
    isModelAvailable,
    log,
    maxRetries,
    retryDelayMs,
    config: config as Record<string, unknown>,
  });
}
