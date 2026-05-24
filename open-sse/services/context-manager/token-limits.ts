import { REGISTRY } from "../../config/registry-providers.ts";
import { getModelContextLimit } from "../../../src/lib/modelsDevSync";
import { CONTEXT_CONFIG } from "../../../src/shared/constants/context";
import { getModelSpec } from "../../../src/shared/constants/modelSpecs";

const SAFETY_MARGIN = 0.8;

function getEnvOverride(provider: string): number | null {
  const envKey = `CONTEXT_LENGTH_${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  const envValue = process.env[envKey];
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  const globalValue = process.env.CONTEXT_LENGTH_DEFAULT;
  if (globalValue) {
    const parsed = parseInt(globalValue, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function getSafeLimit(limit: number, margin: number = SAFETY_MARGIN): number {
  return Math.floor(limit * margin);
}

export function getTokenLimit(provider: string, model: string | null = null): number {
  const envOverride = getEnvOverride(provider);
  if (envOverride) return envOverride;

  if (model) {
    const specLimit = getModelSpec(model)?.contextWindow;
    if (typeof specLimit === "number" && specLimit > 0) return specLimit;
  }

  if (model) {
    const dbLimit = getModelContextLimit(provider, model);
    if (dbLimit && dbLimit > 0) return dbLimit;
  }

  return REGISTRY[provider]?.defaultContextLength ?? CONTEXT_CONFIG.defaultLimit;
}

export function getEffectiveContextLimit(
  provider: string,
  model: string | null = null,
  combo: Record<string, unknown> | null = null
): number {
  const envOverride = getEnvOverride(provider);
  if (envOverride) return envOverride;

  const providerLimit = getTokenLimit(provider, model);

  if (combo && typeof combo.context_length === "number" && combo.context_length > 0) {
    return Math.min(providerLimit, combo.context_length);
  }

  return providerLimit;
}

export function getEffectiveSafeContextLimit(
  provider: string,
  model: string | null = null,
  combo: Record<string, unknown> | null = null
): number {
  return getSafeLimit(getEffectiveContextLimit(provider, model, combo));
}
