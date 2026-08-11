import { parseModel } from "../model.ts";
import { getComboMetrics } from "../comboMetrics.ts";
import { getModelContextLimit } from "../../../src/lib/modelsDevSync";

/**
 * Sentinel for "no pricing known". Not `Infinity`: two unpriced models would
 * then compare as `Infinity - Infinity`, i.e. `NaN`, and a comparator returning
 * NaN leaves the sort order undefined per spec. `MAX_VALUE - MAX_VALUE` is `0`,
 * so unpriced models compare equal and the sort's stability keeps them in
 * configured order.
 */
const UNPRICED = Number.MAX_VALUE;

export async function sortModelsByCost(models: string[]): Promise<string[]> {
  try {
    const { getPricingForModel } = await import("../../../src/lib/localDb");
    const withCost = await Promise.all(
      models.map(async (modelStr) => {
        const parsed = parseModel(modelStr);
        const provider = parsed.provider || parsed.providerAlias || "unknown";
        const model = parsed.model || modelStr;
        try {
          const pricing = await getPricingForModel(provider, model);
          const raw = pricing?.input;
          const cost = typeof raw === "number" ? raw : Number(raw);
          return { modelStr, cost: Number.isFinite(cost) ? cost : UNPRICED };
        } catch {
          return { modelStr, cost: UNPRICED };
        }
      })
    );
    withCost.sort((a, b) => a.cost - b.cost || 0);
    return withCost.map((e) => e.modelStr);
  } catch {
    return models;
  }
}

export function sortModelsByUsage(models: string[], comboName: string): string[] {
  const metrics = getComboMetrics(comboName);
  if (!metrics || !metrics.byModel) return models;

  const withUsage = models.map((modelStr) => ({
    modelStr,
    requests: metrics.byModel[modelStr]?.requests ?? 0,
  }));
  withUsage.sort((a, b) => a.requests - b.requests);
  return withUsage.map((e) => e.modelStr);
}

export function sortModelsByContextSize(
  models: string[],
  combo: { context_length?: number } | null
): string[] {
  const comboCap =
    combo && typeof combo.context_length === "number" && combo.context_length > 0
      ? combo.context_length
      : null;

  const withContext = models.map((modelStr) => {
    const parsed = parseModel(modelStr);
    const provider = parsed.provider || parsed.providerAlias || "unknown";
    const model = parsed.model || modelStr;
    let limit = getModelContextLimit(provider, model) ?? 0;

    if (comboCap && limit > comboCap) {
      limit = comboCap;
    }

    return { modelStr, context: limit };
  });
  withContext.sort((a, b) => b.context - a.context);
  return withContext.map((e) => e.modelStr);
}
