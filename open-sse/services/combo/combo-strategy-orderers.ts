import { randomInt } from "node:crypto";
import { parseModel } from "../model.ts";
import { getComboMetrics } from "../comboMetrics.ts";

/**
 * Promote models for the last-known-good provider to the front (stable within groups).
 * `providerId` is the stored LKGP value (provider id string).
 */
export function orderModelsByLkgp(
  models: string[],
  providerId: string | null | undefined
): string[] {
  if (!providerId || models.length <= 1) return models;
  const needle = String(providerId).toLowerCase();
  const preferred: string[] = [];
  const rest: string[] = [];
  for (const modelStr of models) {
    const parsed = parseModel(modelStr);
    const provider = String(parsed.provider || parsed.providerAlias || "").toLowerCase();
    const prefix = modelStr.toLowerCase().startsWith(`${needle}/`);
    if (provider === needle || prefix) preferred.push(modelStr);
    else rest.push(modelStr);
  }
  if (preferred.length === 0) return models;
  return [...preferred, ...rest];
}

/**
 * Headroom proxy: prefer lowest load (fewest requests + failures).
 * Full 5h/7d quota headroom needs saturation signals (upstream port later).
 */
export function orderModelsByHeadroom(models: string[], comboName: string): string[] {
  if (models.length <= 1) return models;
  const metrics = getComboMetrics(comboName);
  const byModel = metrics?.byModel || {};

  const decorated = models.map((modelStr, index) => {
    const m = byModel[modelStr];
    const requests = m?.requests ?? 0;
    const failures = m?.failures ?? 0;
    // Higher score = more free capacity
    const load = requests + failures * 2;
    return { modelStr, index, load };
  });

  decorated.sort((a, b) => {
    if (a.load !== b.load) return a.load - b.load;
    return a.index - b.index;
  });
  return decorated.map((e) => e.modelStr);
}

/**
 * Power-of-two-choices: sample two models, pick the lower-load one first, rest follow.
 */
export function orderModelsByP2c(models: string[], comboName: string): string[] {
  if (models.length <= 1) return models;
  const metrics = getComboMetrics(comboName);
  const byModel = metrics?.byModel || {};
  const loadOf = (m: string) => {
    const row = byModel[m];
    return (row?.requests ?? 0) + (row?.failures ?? 0);
  };

  const i = randomInt(models.length);
  let j = randomInt(models.length);
  if (j === i) j = (j + 1) % models.length;

  const a = models[i];
  const b = models[j];
  const pick = loadOf(a) <= loadOf(b) ? a : b;
  return [pick, ...models.filter((m) => m !== pick)];
}
