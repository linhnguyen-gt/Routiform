import { resolveNestedComboModels } from "./combo-dag.ts";
import { normalizeModelEntry } from "./combo-model-entry.ts";
import { orderModelsForWeightedFallback, selectWeightedModel } from "./combo-selection-weighted.ts";

type LogLike = { info: (tag: string, msg: string) => void };

/** First pass: flatten nested combos and resolve weighted selection order. */
export function resolveInitialOrderedModels(
  combo: { models?: unknown[]; name?: string },
  allCombos: unknown,
  strategy: string,
  models: unknown[],
  log: LogLike
): string[] {
  let orderedModels: string[];

  // Filter out disabled models first
  const activeModels = models.filter((m) => !normalizeModelEntry(m).disabled);

  if (allCombos) {
    if (strategy === "weighted") {
      const selected = selectWeightedModel(activeModels);
      orderedModels = orderModelsForWeightedFallback(activeModels, selected);
      orderedModels = orderedModels.flatMap((m) => {
        const combos = Array.isArray(allCombos)
          ? allCombos
          : (allCombos as { combos?: unknown[] })?.combos || [];
        const nested = combos.find((c: { name?: string }) => c.name === m) as
          { name: string; models?: unknown[] } | undefined;
        if (nested) return resolveNestedComboModels(nested, allCombos);
        return [m];
      });
      log.info(
        "COMBO",
        `Weighted selection with nested resolution: ${orderedModels.length} total models`
      );
    } else {
      // Only the non-weighted branch consumes the flattened list; the weighted
      // branch re-resolves per selected entry above, so computing this eagerly
      // walked every nested combo on every weighted request for nothing.
      orderedModels = resolveNestedComboModels(
        combo as { name: string; models?: unknown[] },
        allCombos
      );
      log.info("COMBO", `${strategy} with nested resolution: ${orderedModels.length} total models`);
    }
  } else if (strategy === "weighted") {
    const selected = selectWeightedModel(activeModels);
    orderedModels = orderModelsForWeightedFallback(activeModels, selected);
    log.info("COMBO", `Weighted selection: ${selected} (from ${activeModels.length} models)`);
  } else {
    orderedModels = activeModels.map((m) => normalizeModelEntry(m).model);
  }

  return orderedModels;
}
