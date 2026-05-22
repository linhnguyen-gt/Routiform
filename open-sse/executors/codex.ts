import { createHash } from "node:crypto";
import { BaseExecutor } from "./base.ts";
import { CODEX_DEFAULT_INSTRUCTIONS } from "../config/codexInstructions.ts";
import { PROVIDERS } from "../config/constants.ts";
import { generateSessionId } from "../services/sessionManager.ts";
import { getAccessToken } from "../services/tokenRefresh.ts";
import { getCodexRequestDefaults } from "@/lib/providers/requestDefaults";

// T09: Codex vs Spark Scope-Aware Rate Limiting
// Codex has two independent quota pools: "codex" (standard) and "spark" (premium).
// Exhausting one should NOT block requests to the other.
// Ref: sub2api PR #1129 (feat(openai): split codex spark rate limiting from codex)

/**
 * Maps model name substrings to their rate-limit scope.
 * Checked in order — first match wins.
 */
const CODEX_SCOPE_PATTERNS: Array<{ pattern: string; scope: "codex" | "spark" }> = [
  { pattern: "codex-spark", scope: "spark" },
  { pattern: "spark", scope: "spark" },
  { pattern: "codex", scope: "codex" },
  { pattern: "gpt-5", scope: "codex" }, // gpt-5.2-codex, gpt-5.3-codex, etc.
];

/**
 * T09: Determine the rate-limit scope for a Codex model.
 * Use this key as the suffix for per-scope rate limit state:
 *   `${accountId}:${getModelScope(model)}`
 *
 * @param model - The Codex model ID (e.g. "gpt-5.3-codex", "codex-spark-mini")
 * @returns "codex" | "spark"
 */
export function getCodexModelScope(model: string): "codex" | "spark" {
  const lower = model.toLowerCase();
  for (const { pattern, scope } of CODEX_SCOPE_PATTERNS) {
    if (lower.includes(pattern)) return scope;
  }
  return "codex"; // default scope
}

/**
 * T09: Get the scope-keyed rate limit identifier for an account+model combination.
 * Use this as the key for rateLimitState maps to ensure scope isolation.
 */
export function getCodexRateLimitKey(accountId: string, model: string): string {
  return `${accountId}:${getCodexModelScope(model)}`;
}

/**
 * T03: Parsed quota snapshot from Codex response headers.
 * Codex includes per-account usage windows that allow precise reset scheduling.
 * Ref: sub2api PR #357 (feat(oauth): persist usage snapshots and window cooldown)
 */
export interface CodexQuotaSnapshot {
  usage5h: number; // tokens used in 5h window
  limit5h: number; // token limit for 5h window
  resetAt5h: string | null; // ISO timestamp when 5h window resets
  usage7d: number; // tokens used in 7d window
  limit7d: number; // token limit for 7d window
  resetAt7d: string | null; // ISO timestamp when 7d window resets
}

/**
 * T03: Parse Codex-specific quota headers from a provider response.
 * Returns null if none of the relevant headers are present.
 *
 * Extracts:
 *   x-codex-5h-usage / x-codex-5h-limit / x-codex-5h-reset-at
 *   x-codex-7d-usage / x-codex-7d-limit / x-codex-7d-reset-at
 */
export function parseCodexQuotaHeaders(headers: Headers): CodexQuotaSnapshot | null {
  const usage5h = headers.get("x-codex-5h-usage");
  const limit5h = headers.get("x-codex-5h-limit");
  const resetAt5h = headers.get("x-codex-5h-reset-at");
  const usage7d = headers.get("x-codex-7d-usage");
  const limit7d = headers.get("x-codex-7d-limit");
  const resetAt7d = headers.get("x-codex-7d-reset-at");

  // Return null if none of the quota headers are present (not a quota-aware response)
  if (!usage5h && !limit5h && !resetAt5h && !usage7d && !limit7d && !resetAt7d) {
    return null;
  }

  return {
    usage5h: usage5h ? parseFloat(usage5h) : 0,
    limit5h: limit5h ? parseFloat(limit5h) : Infinity,
    resetAt5h: resetAt5h ?? null,
    usage7d: usage7d ? parseFloat(usage7d) : 0,
    limit7d: limit7d ? parseFloat(limit7d) : Infinity,
    resetAt7d: resetAt7d ?? null,
  };
}

/**
 * T03: Get the soonest quota reset time from a CodexQuotaSnapshot.
 * 7d window takes priority (wider window, harder limit) but we use whichever
 * is further in the future to avoid releasing the block too early.
 *
 * @returns Unix timestamp (ms) of the soonest effective reset, or null
 */
export function getCodexResetTime(quota: CodexQuotaSnapshot): number | null {
  const times: number[] = [];
  if (quota.resetAt7d) {
    const t = new Date(quota.resetAt7d).getTime();
    if (!isNaN(t) && t > Date.now()) times.push(t);
  }
  if (quota.resetAt5h) {
    const t = new Date(quota.resetAt5h).getTime();
    if (!isNaN(t) && t > Date.now()) times.push(t);
  }
  if (times.length === 0) return null;
  return Math.max(...times); // Use furthest-out reset to avoid premature unblock
}

// Ordered list of effort levels from lowest to highest
const EFFORT_ORDER = ["none", "low", "medium", "high", "xhigh"] as const;
type EffortLevel = (typeof EFFORT_ORDER)[number];
const CODEX_FAST_WIRE_VALUE = "priority";

function getResponsesSubpath(endpointPath: unknown): string | null {
  const normalizedEndpoint = String(endpointPath || "").replace(/\/+$/, "");
  const match = normalizedEndpoint.match(/(?:^|\/)responses(?:(\/.*))?$/i);
  if (!match) return null;
  return match[1] || "";
}

function isCompactResponsesEndpoint(endpointPath: unknown): boolean {
  return getResponsesSubpath(endpointPath)?.toLowerCase() === "/compact";
}

function normalizeServiceTierValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "fast") return CODEX_FAST_WIRE_VALUE;
  return normalized;
}

function normalizeEffortValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "max") normalized = "xhigh";
  return normalized;
}

/**
 * Maximum reasoning effort allowed per Codex model.
 * Models not listed here default to "xhigh" (unrestricted).
 * Update this table when Codex releases new models with different caps.
 */
const MAX_EFFORT_BY_MODEL: Record<string, EffortLevel> = {
  "gpt-5.3-codex": "xhigh",
  "gpt-5.2-codex": "xhigh",
  "gpt-5.1-codex-max": "xhigh",
  "gpt-5-mini": "high",
  "gpt-5.1-mini": "high",
  "gpt-4.1-mini": "high",
};

/**
 * Clamp reasoning effort to the model's maximum allowed level.
 * Returns the original value if within limits, or the cap if it exceeds it.
 */
function clampEffort(model: string, requested: string): string {
  const max: EffortLevel = MAX_EFFORT_BY_MODEL[model] ?? "xhigh";
  const reqIdx = EFFORT_ORDER.indexOf(requested as EffortLevel);
  const maxIdx = EFFORT_ORDER.indexOf(max);
  if (reqIdx > maxIdx) {
    console.debug(`[Codex] clampEffort: "${requested}" → "${max}" (model: ${model})`);
    return max;
  }
  return requested;
}

function convertSystemToDeveloperRole(body: Record<string, unknown>): void {
  if (!Array.isArray(body.input)) return;

  for (const item of body.input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const role = typeof record.role === "string" ? record.role : "";
    const type = typeof record.type === "string" ? record.type : "";
    const isSystemMessage = role === "system" && (!type || type === "message");
    if (isSystemMessage) {
      record.role = "developer";
    }
  }
}

function stripStoredItemReferences(body: Record<string, unknown>): void {
  const prev = body.previous_response_id;
  const preservePreviousResponseId =
    typeof prev === "string" &&
    prev.length > 0 &&
    (!Array.isArray(body.input) || body.input.length === 0);
  if (!preservePreviousResponseId) {
    delete body.previous_response_id;
  }
  if (!Array.isArray(body.input)) return;
  const SERVER_ID_PATTERN = /^(rs|fc|resp|msg)_/;
  let strippedCount = 0;
  body.input = body.input.filter((item) => {
    if (typeof item === "string" && SERVER_ID_PATTERN.test(item)) {
      strippedCount++;
      return false;
    }
    if (
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      (item as Record<string, unknown>).type === "item_reference"
    ) {
      strippedCount++;
      return false;
    }
    if (item && typeof item === "object" && !Array.isArray(item)) {
      if (
        typeof (item as Record<string, unknown>).id === "string" &&
        SERVER_ID_PATTERN.test((item as Record<string, unknown>).id as string)
      ) {
        delete (item as Record<string, unknown>).id;
        strippedCount++;
      }
    }
    return true;
  });
  if (strippedCount > 0)
    console.debug(
      `[Codex] stripStoredItemReferences: sanitized ${strippedCount} server-generated ID(s)`
    );
}

/**
 * Codex Executor - handles OpenAI Codex API (Responses API format)
 * Automatically injects default instructions if missing.
 * IMPORTANT: Includes chatgpt-account-id header for workspace binding.
 */
export class CodexExecutor extends BaseExecutor {
  constructor() {
    super("codex", PROVIDERS.codex);
  }

  buildUrl(model, stream, urlIndex = 0, credentials = null) {
    void model;
    void stream;
    void urlIndex;

    const responsesSubpath = getResponsesSubpath(credentials?.requestEndpointPath);
    if (responsesSubpath !== null) {
      const baseUrl = String(this.config.baseUrl || "").replace(/\/$/, "");
      if (baseUrl.endsWith("/responses")) {
        return `${baseUrl}${responsesSubpath}`;
      }
      return `${baseUrl}/responses${responsesSubpath}`;
    }

    return super.buildUrl(model, stream, urlIndex, credentials);
  }

  /**
   * Codex Responses endpoint is SSE-first.
   * Always request event-stream from upstream, even when client requested stream=false.
   * Includes chatgpt-account-id header for strict workspace binding.
   */
  buildHeaders(credentials, _stream = true) {
    const isCompactRequest = isCompactResponsesEndpoint(credentials?.requestEndpointPath);
    const headers = super.buildHeaders(credentials, isCompactRequest ? false : true);

    // Add workspace binding header if workspaceId is persisted
    const workspaceId = credentials?.providerSpecificData?.workspaceId;
    if (workspaceId) {
      headers["chatgpt-account-id"] = workspaceId;
    }

    // Codex originator + session_id prompt-cache-affinity headers
    headers["originator"] = "codex_cli_rs";
    headers["x-codex-version"] = "0.124.0";

    // Installation ID for client identification
    const installationId = credentials?.providerSpecificData?.installationId;
    if (installationId && typeof installationId === "string") {
      headers["x-codex-installation-id"] = installationId;
    }

    const sessionId = credentials?.providerSpecificData?.ccSessionId;
    if (sessionId && typeof sessionId === "string") {
      headers["session_id"] = sessionId;
    }

    return headers;
  }

  /**
   * Refresh Codex OAuth credentials when a 401 is received.
   * OpenAI uses rotating (one-time-use) refresh tokens — if the token was already
   * consumed by a concurrent refresh, this returns null to signal re-auth is needed.
   *
   * Fixes #251: After a server restart/upgrade, previously cached access tokens may
   * have expired or become invalid. chatCore.ts calls this on 401; previously the
   * base class returned null causing the request to fail instead of refreshing.
   */
  async refreshCredentials(credentials, log) {
    if (!credentials?.refreshToken) {
      log?.warn?.("TOKEN_REFRESH", "Codex: no refresh token available, re-authentication required");
      return null;
    }
    const result = await getAccessToken("codex", credentials, log);
    if (!result || result.error) {
      log?.warn?.(
        "TOKEN_REFRESH",
        `Codex: token refresh failed${result?.error ? ` (${result.error})` : ""} — re-authentication required`
      );
      return null;
    }
    return result;
  }

  /**
   * Transform request before sending - inject default instructions if missing
   */
  transformRequest(model, body, stream, credentials) {
    const nativeCodexPassthrough = body?._nativeCodexPassthrough === true;
    const isCompactRequest = isCompactResponsesEndpoint(credentials?.requestEndpointPath);
    const requestDefaults = getCodexRequestDefaults(credentials?.providerSpecificData);

    // Codex /responses rejects stream=false, but /responses/compact rejects the stream field entirely.
    if (isCompactRequest) {
      delete body.stream;
      delete body.stream_options;
    } else {
      body.stream = true;
    }
    delete body._nativeCodexPassthrough;

    // Strip server-generated IDs from multi-turn input.
    // system→developer must apply on BOTH passthrough+translated paths.
    stripStoredItemReferences(body);
    convertSystemToDeveloperRole(body);

    const requestServiceTier = normalizeServiceTierValue(body.service_tier);
    if (requestServiceTier) {
      body.service_tier = requestServiceTier;
    } else if (requestDefaults.serviceTier) {
      body.service_tier = requestDefaults.serviceTier;
    }

    if (nativeCodexPassthrough) {
      if (
        !body.instructions ||
        (typeof body.instructions === "string" && !body.instructions.trim())
      ) {
        body.instructions = "Follow the developer instructions in the conversation.";
      }
      // store defaults to true for native passthrough to enable prompt cache affinity.
      // Non-passthrough (translated) path keeps the Codex default (false) for privacy.
      if (body.store === undefined) {
        body.store = true;
      }
    } else if (
      !body.instructions ||
      (typeof body.instructions === "string" && !body.instructions.trim())
    ) {
      body.instructions = CODEX_DEFAULT_INSTRUCTIONS;
    }

    const normalizedSessionInput = Array.isArray(body.input)
      ? body.input
      : typeof body.input === "string" && body.input.trim()
        ? [{ role: "user", content: body.input }]
        : undefined;

    // Keep a stable session_id for Codex conversation continuity.
    if (!body.session_id) {
      body.session_id = generateSessionId(
        {
          model: typeof body.model === "string" ? body.model : model,
          system: body.instructions,
          input: normalizedSessionInput,
          tools: Array.isArray(body.tools) ? body.tools : undefined,
        },
        { provider: "codex" }
      );
    }

    // Mirror Codex CLI request shape: installation identity lives in client_metadata,
    // not a standalone HTTP header. This helps backend feature/version gating.
    const installationId = credentials?.providerSpecificData?.installationId;
    if (installationId && typeof installationId === "string") {
      const currentMetadata =
        body.client_metadata && typeof body.client_metadata === "object"
          ? { ...(body.client_metadata as Record<string, unknown>) }
          : {};
      if (!currentMetadata["x-codex-installation-id"]) {
        currentMetadata["x-codex-installation-id"] = installationId;
      }
      body.client_metadata = currentMetadata;
    }

    // Issue #806: Even for native passthrough, some clients (purist completions) might indiscriminately inject
    // a `messages` or `prompt` array which the strict Codex Responses schema rejects.
    delete body.messages;
    delete body.prompt;

    const effortLevels = ["none", "low", "medium", "high", "xhigh"];
    let modelEffort: string | null = null;
    let cleanModel = typeof body.model === "string" ? body.model : model;
    for (const level of effortLevels) {
      if (typeof cleanModel === "string" && cleanModel.endsWith(`-${level}`)) {
        modelEffort = level;
        body.model = cleanModel.slice(0, -`-${level}`.length);
        cleanModel = body.model;
        console.log(`[Codex] Extracted reasoning effort from model suffix: ${level}`);
        break;
      }
    }

    const explicitReasoning = normalizeEffortValue(body?.reasoning?.effort);
    const requestReasoningEffort = normalizeEffortValue(body.reasoning_effort);
    const fallbackReasoningEffort = null;
    const rawEffort =
      explicitReasoning || requestReasoningEffort || modelEffort || fallbackReasoningEffort;

    console.log(
      `[Codex] Reasoning effort sources - explicit: ${explicitReasoning}, request: ${requestReasoningEffort}, model: ${modelEffort}, final: ${rawEffort}`
    );

    if (explicitReasoning) {
      const clampedEffort = clampEffort(cleanModel, explicitReasoning);
      body.reasoning = {
        ...(body.reasoning && typeof body.reasoning === "object" ? body.reasoning : {}),
        effort: clampedEffort,
      };
      console.log(`[Codex] Reasoning effort set: ${clampedEffort} (model: ${cleanModel})`);
    } else if (rawEffort) {
      const clampedEffort = clampEffort(cleanModel, rawEffort);
      body.reasoning = {
        ...(body.reasoning && typeof body.reasoning === "object" ? body.reasoning : {}),
        effort: clampedEffort,
      };
      console.log(`[Codex] Reasoning effort set: ${clampedEffort} (model: ${cleanModel})`);
    }
    delete body.reasoning_effort;

    // Codex backend /responses rejects token-cap aliases from generic OpenAI flows.
    // Drop all token-cap fields to avoid 400 unsupported parameter errors.
    delete body.max_tokens;
    delete body.max_output_tokens;
    delete body.max_completion_tokens;

    // session_id is used internally for cache affinity but the Codex API rejects it.
    delete body.session_id;

    // Native passthrough must return after hygiene only; do not strip `tools` (MCP namespaces,
    // hosted tools) or other Responses fields — upstream parity
    if (nativeCodexPassthrough) {
      return body;
    }

    // Inject prompt_cache_key for Codex Responses API cache affinity
    if (!body.prompt_cache_key && Array.isArray(body.input)) {
      const inputStr = JSON.stringify(body.input);
      const hash = createHash("sha256").update(inputStr).digest("hex").slice(0, 16);
      body.prompt_cache_key = `codex_${hash}`;
    }

    // Remove unsupported parameters for Codex API
    delete body.temperature;
    delete body.top_p;
    delete body.frequency_penalty;
    delete body.presence_penalty;
    delete body.logprobs;
    delete body.top_logprobs;
    delete body.n;
    delete body.seed;
    delete body.user; // Cursor sends this but Codex doesn't support it
    delete body.prompt_cache_retention; // Cursor sends this but Codex doesn't support it
    delete body.metadata; // Cursor sends this but Codex doesn't support it
    delete body.stream_options; // Cursor sends this but Codex doesn't support it
    delete body.safety_identifier; // Droid CLI sends this but Codex doesn't support it
    delete body.session_id; // Generated internally but Codex API doesn't support it

    return body;
  }
}
