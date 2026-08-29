import { getCombos, getProviderConnections, getAllCustomModels } from "@/lib/localDb";
import { getAllSyncedAvailableModels } from "@/lib/db/models";
import { AI_MODELS, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import { ollamaModels } from "@routiform/open-sse/config/ollamaModels.ts";

export interface OllamaModelDetails {
  format: string;
  family: string;
  families: string[];
  parameter_size: string;
  quantization_level: string;
}

export interface OllamaModelSummary {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: OllamaModelDetails;
}

/**
 * Infer model family from model ID
 */
export function inferModelFamily(modelId: string): string {
  const lower = modelId.toLowerCase();
  if (lower.includes("llama")) return "llama";
  if (lower.includes("qwen")) return "qwen";
  if (lower.includes("deepseek")) return "deepseek";
  if (
    lower.includes("mistral") ||
    lower.includes("mixtral") ||
    lower.includes("devstral") ||
    lower.includes("codestral")
  )
    return "mistral";
  if (lower.includes("gemma")) return "gemma";
  if (lower.includes("claude")) return "claude";
  if (lower.includes("gpt")) return "gpt";
  if (lower.includes("gemini")) return "gemini";
  if (lower.includes("phi")) return "phi";
  if (lower.includes("glm")) return "glm";
  if (lower.includes("minimax")) return "minimax";
  if (lower.includes("command")) return "cohere";

  // Fallback to provider or prefix if present
  if (lower.includes("/")) {
    const parts = lower.split("/");
    return parts[parts.length - 1].split(/[-_:]/)[0] || "custom";
  }
  return lower.split(/[-_:]/)[0] || "custom";
}

/**
 * Infer parameter size string from model ID
 */
export function inferParameterSize(modelId: string): string {
  const lower = modelId.toLowerCase();
  const moeMatch = lower.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*b/i);
  if (moeMatch) {
    return `${moeMatch[1]}x${moeMatch[2]}B`;
  }
  const paramMatch = lower.match(/(\d+(?:\.\d+)?)\s*b(?:\b|[-_:]|$)/i);
  if (paramMatch) {
    return `${paramMatch[1]}B`;
  }
  return "unknown";
}

/**
 * Infer model details object
 */
export function inferModelDetails(modelId: string): OllamaModelDetails {
  const family = inferModelFamily(modelId);
  const parameterSize = inferParameterSize(modelId);
  return {
    format: "gguf",
    family,
    families: [family],
    parameter_size: parameterSize,
    quantization_level: "Q4_K_M",
  };
}

/**
 * Build pseudo digest for model ID
 */
function createDigest(modelId: string): string {
  let hash = 0;
  for (let i = 0; i < modelId.length; i++) {
    hash = (hash << 5) - hash + modelId.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  return `${hex}${hex}${hex}${hex}${hex}${hex}${hex}${hex}`.slice(0, 64);
}

/**
 * Build an Ollama ModelSummary object from a model identifier
 */
export function buildOllamaModelSummary(
  modelId: string,
  modifiedAt = new Date().toISOString()
): OllamaModelSummary {
  const details = inferModelDetails(modelId);
  return {
    name: modelId,
    model: modelId,
    modified_at: modifiedAt,
    size: 4294967296, // default ~4GB representation
    digest: createDigest(modelId),
    details,
  };
}

/**
 * Fetch dynamic list of available models for Ollama /api/tags
 */
export async function getDynamicOllamaModels(): Promise<{ models: OllamaModelSummary[] }> {
  const modelMap = new Map<string, OllamaModelSummary>();
  const timestamp = new Date().toISOString();

  try {
    // 1. Add active Combos
    const combos = await getCombos().catch(() => []);
    if (Array.isArray(combos)) {
      for (const combo of combos) {
        if (combo && combo.name && combo.isActive !== false) {
          modelMap.set(combo.name, buildOllamaModelSummary(combo.name, timestamp));
        }
      }
    }

    // 2. Add active provider models
    const connections = await getProviderConnections().catch(() => []);
    const activeProviders = new Set<string>();
    if (Array.isArray(connections)) {
      for (const c of connections) {
        if (c && c.isActive !== false && c.provider) {
          const pId = String(c.provider);
          activeProviders.add(pId);
          const alias = PROVIDER_ID_TO_ALIAS[pId];
          if (alias) activeProviders.add(alias);
        }
      }
    }

    // 3. Add Synced available models
    const syncedModelsMap = await getAllSyncedAvailableModels().catch(() => ({}));
    if (syncedModelsMap && typeof syncedModelsMap === "object") {
      for (const [provider, rawModels] of Object.entries(syncedModelsMap)) {
        if (activeProviders.size > 0 && !activeProviders.has(provider)) continue;
        if (Array.isArray(rawModels)) {
          for (const m of rawModels) {
            const mId = typeof m === "string" ? m : m?.id || m?.model;
            if (mId && typeof mId === "string") {
              const fullId = `${provider}/${mId}`;
              modelMap.set(fullId, buildOllamaModelSummary(fullId, timestamp));
              // Also add bare model ID if not conflicting
              if (!modelMap.has(mId)) {
                modelMap.set(mId, buildOllamaModelSummary(mId, timestamp));
              }
            }
          }
        }
      }
    }

    // 4. Add static AI_MODELS
    for (const m of AI_MODELS) {
      if (activeProviders.size > 0 && !activeProviders.has(m.provider)) continue;
      const fullId = m.fullModel || `${m.provider}/${m.model}`;
      if (!modelMap.has(fullId)) {
        modelMap.set(fullId, buildOllamaModelSummary(fullId, timestamp));
      }
      if (!modelMap.has(m.model)) {
        modelMap.set(m.model, buildOllamaModelSummary(m.model, timestamp));
      }
    }

    // 5. Add custom models
    const customModelsMap = (await getAllCustomModels().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (customModelsMap && typeof customModelsMap === "object") {
      for (const [providerId, rawModels] of Object.entries(customModelsMap)) {
        if (Array.isArray(rawModels)) {
          for (const m of rawModels) {
            const mId =
              m && typeof m === "object" && "id" in m && typeof m.id === "string" ? m.id : null;
            if (mId) {
              const fullId = `${providerId}/${mId}`;
              modelMap.set(fullId, buildOllamaModelSummary(fullId, timestamp));
              if (!modelMap.has(mId)) {
                modelMap.set(mId, buildOllamaModelSummary(mId, timestamp));
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("[Ollama] Error building dynamic models list:", error);
  }

  // Fallback if empty
  if (modelMap.size === 0) {
    return (ollamaModels as unknown as { models: OllamaModelSummary[] }) || { models: [] };
  }

  return {
    models: Array.from(modelMap.values()),
  };
}

/**
 * Build Ollama /api/show response
 */
export function getOllamaShowModelDetails(modelId: string) {
  const details = inferModelDetails(modelId);
  const isVision = modelId.toLowerCase().includes("vision") || modelId.toLowerCase().includes("vl");
  const capabilities = ["completion"];
  if (isVision) capabilities.push("vision");
  capabilities.push("tools");

  return {
    license: "Standard Model Terms of Use",
    modified_at: new Date().toISOString(),
    details,
    capabilities,
    template: "{{ .System }}\nUSER: {{ .Prompt }}\nASSISTANT: {{ .Response }}",
    parameters: "temperature 0.7\ntop_p 0.9",
    model_info: {
      "general.architecture": details.family,
      "general.parameter_count": details.parameter_size,
      "general.file_type": 15,
      "general.quantization_version": 2,
    },
  };
}
