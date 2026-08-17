import {
  finalizeTomlLines,
  parseTomlRootValue,
  removeTomlRootKey,
  removeTomlSection,
  splitTomlLines,
  toTomlString,
  upsertTomlRootKey,
  upsertTomlRootNumber,
  upsertTomlSection,
} from "./tomlLines";

const ROUTIFORM_SECTION_NAME = "model_providers.routiform";

const normalizeBaseUrl = (baseUrl: string) => (baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`);

export const hasRoutiformCodexConfig = (config: string | null) => {
  if (!config) return false;
  return (
    config.includes('model_provider = "routiform"') ||
    config.includes(`[${ROUTIFORM_SECTION_NAME}]`)
  );
};

export const hasUsableCodexAuth = (authContent: string | null) => {
  if (!authContent) return false;

  try {
    const auth = JSON.parse(authContent) as {
      OPENAI_API_KEY?: unknown;
      auth_mode?: unknown;
      tokens?: {
        id_token?: unknown;
        access_token?: unknown;
        refresh_token?: unknown;
      };
    };
    const apiKey = String(auth?.OPENAI_API_KEY || "").trim();
    if (apiKey.length > 0 && !apiKey.includes("****")) {
      return true;
    }

    const authMode = String(auth?.auth_mode || "")
      .trim()
      .toLowerCase();
    const hasChatGptTokens =
      !!String(auth?.tokens?.id_token || "").trim() ||
      !!String(auth?.tokens?.access_token || "").trim() ||
      !!String(auth?.tokens?.refresh_token || "").trim();

    return authMode === "chatgpt" && hasChatGptTokens;
  } catch {
    return false;
  }
};

/**
 * Codex only knows the context window of its own built-in slugs. Anything routed through
 * us — a combo, or any model it has never heard of — falls back to its unknown-model
 * metadata (272k, at 95% effective), so the context meter reports a number that has nothing
 * to do with the model actually answering. `model_context_window` is the documented override.
 *
 * Codex clamps the override to the model's `max_context_window`, which for an unknown slug is
 * that same 272k — so this can correct a window downwards but cannot raise one above it.
 */
export const applyRoutiformCodexConfig = (
  existingConfig: string | null,
  { model, baseUrl, contextWindow }: { model: string; baseUrl: string; contextWindow?: number }
) => {
  const lines = splitTomlLines(existingConfig);

  upsertTomlRootKey(lines, "model", model);
  upsertTomlRootKey(lines, "model_provider", "routiform");
  if (contextWindow && contextWindow > 0) {
    upsertTomlRootNumber(lines, "model_context_window", contextWindow);
  } else {
    // A stale window from a previously configured model is worse than none.
    removeTomlRootKey(lines, "model_context_window");
  }
  upsertTomlSection(lines, ROUTIFORM_SECTION_NAME, [
    `[${ROUTIFORM_SECTION_NAME}]`,
    `name = ${toTomlString("Routiform")}`,
    `base_url = ${toTomlString(normalizeBaseUrl(baseUrl))}`,
    `wire_api = ${toTomlString("responses")}`,
  ]);

  return finalizeTomlLines(lines);
};

export const removeRoutiformCodexConfig = (existingConfig: string | null) => {
  const lines = splitTomlLines(existingConfig);
  const modelProvider = parseTomlRootValue(lines, "model_provider");

  if (modelProvider === "routiform") {
    removeTomlRootKey(lines, "model");
    removeTomlRootKey(lines, "model_provider");
    removeTomlRootKey(lines, "model_context_window");
  }

  removeTomlSection(lines, ROUTIFORM_SECTION_NAME);

  return finalizeTomlLines(lines);
};
