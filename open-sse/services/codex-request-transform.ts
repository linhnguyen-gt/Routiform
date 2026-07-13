// Codex Responses API request transformation.
// Extracted verbatim from CodexExecutor.transformRequest (no behavior change):
// endpoint-aware stream hygiene, stored-item sanitation, service_tier /
// instructions / session_id / client_metadata defaults, reasoning-effort
// resolution + clamping, and removal of fields the Codex backend rejects.

import { CODEX_DEFAULT_INSTRUCTIONS } from "../config/codexInstructions.ts";
import { generateSessionId } from "./sessionManager.ts";
import {
  asRecord,
  clampEffort,
  convertSystemToDeveloperRole,
  EFFORT_ORDER,
  isCompactResponsesEndpoint,
  normalizeEffortValue,
  normalizeServiceTierValue,
  stripStoredItemReferences,
  type CodexRequestBody,
} from "./codex-request-shaping.ts";
import type { ProviderCredentials } from "../executors/base.ts";
import { createHash } from "node:crypto";
import { getCodexRequestDefaults } from "@/lib/providers/requestDefaults";

type SessionFingerprintBody = Parameters<typeof generateSessionId>[0];

/**
 * Shallow-clone a Codex request body plus one level deep into `input` items.
 * Non-mutating contract: downstream shaping steps (stripStoredItemReferences,
 * convertSystemToDeveloperRole, etc.) reassign/delete keys on individual
 * `input` items in place — cloning each item here is what stops those writes
 * from leaking back into the caller's original object across repeated calls
 * (e.g. the same-account retry loop in CodexExecutor.execute(), which calls
 * this transform again with the SAME original body on every attempt).
 */
function cloneCodexRequestBody(body: CodexRequestBody): CodexRequestBody {
  const clone: CodexRequestBody = { ...body };
  if (Array.isArray(body.input)) {
    clone.input = body.input.map((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? { ...(item as Record<string, unknown>) }
        : item
    );
  }
  return clone;
}

/**
 * Transform a request body for the Codex Responses endpoint and return a NEW
 * object. Non-mutating: the caller's original `body` (and its `input` items)
 * is never modified, so calling this repeatedly with the same original body
 * (as CodexExecutor.execute()'s same-account overloaded-retry loop does)
 * produces an identical result on every call instead of drifting after the
 * first invocation deletes/consumes one-shot fields like
 * `_nativeCodexPassthrough`.
 */
export function transformCodexRequestBody(
  model: string,
  originalBody: CodexRequestBody,
  credentials: ProviderCredentials | null | undefined
): CodexRequestBody {
  const body = cloneCodexRequestBody(originalBody);
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
  stripStoredItemReferences(body, { preservePreviousResponseId: nativeCodexPassthrough });
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
      } as SessionFingerprintBody,
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

  let modelEffort: string | null = null;
  let cleanModel = typeof body.model === "string" ? body.model : model;
  for (const level of EFFORT_ORDER) {
    if (typeof cleanModel === "string" && cleanModel.endsWith(`-${level}`)) {
      modelEffort = level;
      const strippedModel = cleanModel.slice(0, -`-${level}`.length);
      body.model = strippedModel;
      cleanModel = strippedModel;
      console.log(`[Codex] Extracted reasoning effort from model suffix: ${level}`);
      break;
    }
  }

  const explicitReasoning = normalizeEffortValue(asRecord(body.reasoning)?.effort);
  const requestReasoningEffort = normalizeEffortValue(body.reasoning_effort);
  const fallbackReasoningEffort = null;
  const rawEffort =
    explicitReasoning || requestReasoningEffort || modelEffort || fallbackReasoningEffort;

  console.log(
    `[Codex] Reasoning effort sources - explicit: ${explicitReasoning}, request: ${requestReasoningEffort}, model: ${modelEffort}, final: ${rawEffort}`
  );

  // `rawEffort` already starts with `explicitReasoning`, so the two original
  // branches (explicit-first, then fallback chain) resolve to the same value.
  if (rawEffort) {
    const clampedEffort = clampEffort(cleanModel, rawEffort);
    body.reasoning = {
      ...(body.reasoning && typeof body.reasoning === "object"
        ? (body.reasoning as Record<string, unknown>)
        : {}),
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
  // (session_id already deleted above, before the passthrough early-return)

  return body;
}
