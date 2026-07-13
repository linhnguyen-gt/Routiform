import type { JsonRecord } from "./json-types";
import { asRecord } from "./json-utils";

const DEFAULT_CODEX_MODELS_BASE_URL = "https://chatgpt.com/backend-api/codex";
export const DEFAULT_CODEX_CLIENT_VERSION = "0.124.0";
const DISABLED_CODEX_MODEL_IDS = new Set(["gpt-oss-120b", "gpt-oss-20b"]);

// Fallback models from Codex documentation when API doesn't return full list.
// Current lineup (as of 2026-07-12, from the Codex CLI model picker) leads the
// list — gpt-5.6-terra is the CLI default. Older ids remain listed below as
// legacy — still routable via `codex -m <model_name>` — so cost routing and
// existing connections pinned to them keep working.
const FALLBACK_CODEX_MODELS: Array<{ id: string; name: string }> = [
  // Current lineup — gpt-5.6-terra is the CLI default.
  { id: "gpt-5.6-terra", name: "GPT-5.6 Terra" },
  { id: "gpt-5.6-luna", name: "GPT-5.6 Luna" },
  { id: "gpt-5.5", name: "GPT-5.5" },
  { id: "gpt-5.4-mini", name: "GPT-5.4 mini" },
  // Legacy — reachable via `codex -m <model_name>`, no longer headline choices.
  { id: "gpt-5.6-sol", name: "GPT-5.6 Sol" },
  { id: "gpt-5.4", name: "GPT-5.4" },
  { id: "gpt-5.3-codex", name: "GPT-5.3-Codex" },
  { id: "gpt-5.3-codex-spark", name: "GPT-5.3-Codex Spark" },
  { id: "gpt-5.2", name: "GPT-5.2" },
  { id: "gpt-5", name: "GPT-5" },
];

function getDefaultCodexModels(): Array<JsonRecord> {
  return FALLBACK_CODEX_MODELS.map((m) => ({
    id: m.id,
    name: m.name,
    hidden: false,
    owned_by: "codex",
  }));
}

export function mergeCodexModels(models: Array<JsonRecord>): Array<JsonRecord> {
  const mergedById = new Map<string, JsonRecord>();

  // Start with fallback models
  for (const model of getDefaultCodexModels()) {
    mergedById.set(String(model.id), model);
  }

  // Override with API models if available
  for (const model of models) {
    const id = typeof model.id === "string" ? model.id : "";
    if (!id) continue;
    mergedById.set(id, {
      ...mergedById.get(id),
      ...model,
    });
  }

  return Array.from(mergedById.values());
}

export function normalizeCodexModelsBaseUrl(baseUrl: string | null): string {
  let normalized = (baseUrl || DEFAULT_CODEX_MODELS_BASE_URL).trim().replace(/\/$/, "");
  if (normalized.endsWith("/responses")) {
    normalized = normalized.slice(0, -10);
  }
  return normalized;
}

export function buildCodexModelsEndpoints(baseUrl: string): string[] {
  const endpoints = [`${baseUrl}/models`, `${baseUrl}/v1/models`, `${baseUrl}/api/codex/models`];
  return [...new Set(endpoints)];
}

export function mapCodexModelsFromApi(data: unknown, includeHidden: boolean): Array<JsonRecord> {
  const record = asRecord(data);
  const rawModels = Array.isArray(record.models)
    ? record.models
    : Array.isArray(record.data)
      ? record.data
      : [];

  const mapped = rawModels
    .map((item) => {
      const model = asRecord(item);
      const id = String(model.id || model.slug || model.model || "").trim();
      if (!id) return null;

      const visibility = typeof model.visibility === "string" ? model.visibility : null;
      const hidden = visibility !== null ? visibility !== "list" : Boolean(model.hidden);

      return {
        ...model,
        id,
        name:
          (typeof model.name === "string" && model.name) ||
          (typeof model.display_name === "string" && model.display_name) ||
          (typeof model.displayName === "string" && model.displayName) ||
          id,
        hidden,
        owned_by: "codex",
      };
    })
    .filter((model) => model !== null) as Array<JsonRecord>;

  const withoutDisabled = mapped.filter((model) => {
    const id = typeof model.id === "string" ? model.id : "";
    return !DISABLED_CODEX_MODEL_IDS.has(id);
  });

  const visible = includeHidden
    ? withoutDisabled
    : withoutDisabled.filter((model) => model.hidden !== true);

  return mergeCodexModels(visible);
}
