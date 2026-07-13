/**
 * Thinking Budget Control — Phase 2
 *
 * Provides proxy-level control over AI thinking/reasoning budgets.
 * Modes: auto, passthrough, custom, adaptive
 */

// Thinking budget modes
export const ThinkingMode = {
  AUTO: "auto", // Let provider decide (remove client's budget)
  PASSTHROUGH: "passthrough", // No changes (current behavior)
  CUSTOM: "custom", // Set fixed budget
  ADAPTIVE: "adaptive", // Scale based on request complexity
};

import {
  capMaxOutputTokens,
  capThinkingBudget,
  getDefaultThinkingBudget,
  getModelSpec,
} from "@/shared/constants/modelSpecs";
import { supportsReasoning } from "./modelCapabilities.ts";

// Effort → budget token mapping
export const EFFORT_BUDGETS = {
  none: 0,
  low: 1024,
  medium: 10240,
  high: 131072, // Handled globally by capThinkingBudget later
  max: 131072, // T11: Claude "max" / "xhigh" — full budget
  xhigh: 131072, // T11: explicit alias used internally
};

// thinkingLevel string → budget token mapping
// Used when clients send string-based thinking levels (e.g., VS Code Copilot)
export const THINKING_LEVEL_MAP = {
  none: 0,
  low: 4096,
  medium: 8192,
  high: 24576,
  max: 131072, // T11: max = full Claude budget (sub2api: xhigh)
  xhigh: 131072, // T11: explicit xhigh alias
};

// Default config (passthrough = backward compatible)
export const DEFAULT_THINKING_CONFIG = {
  mode: ThinkingMode.PASSTHROUGH,
  customBudget: 10240,
  effortLevel: "medium",
};

// In-memory config (loaded from DB on startup, or default)
let _config = { ...DEFAULT_THINKING_CONFIG };

/**
 * Set the thinking budget config (called from settings API or startup)
 */
export function setThinkingBudgetConfig(config) {
  _config = { ...DEFAULT_THINKING_CONFIG, ...config };
}

/**
 * Get current thinking budget config
 */
export function getThinkingBudgetConfig() {
  return { ..._config };
}

/**
 * Normalize thinkingLevel string fields into numeric budget.
 * Handles: body.thinkingLevel, body.thinking_level,
 * and Gemini's generationConfig.thinkingConfig.thinkingLevel
 *
 * @param {object} body - Request body
 * @returns {object} Body with string thinkingLevel converted to numeric budget
 */
export function normalizeThinkingLevel(body) {
  if (!body || typeof body !== "object") return body;
  const result = { ...body };

  // Handle top-level thinkingLevel or thinking_level string fields
  const levelStr = result.thinkingLevel || result.thinking_level;
  if (typeof levelStr === "string" && THINKING_LEVEL_MAP[levelStr.toLowerCase()] !== undefined) {
    const rawBudget = THINKING_LEVEL_MAP[levelStr.toLowerCase()];
    const budget = capThinkingBudget(result.model || "", rawBudget);
    // Convert to Claude thinking format as canonical representation
    result.thinking = {
      type: budget > 0 ? "enabled" : "disabled",
      budget_tokens: budget,
    };
    delete result.thinkingLevel;
    delete result.thinking_level;
  }

  // Handle Gemini's generationConfig.thinkingConfig.thinkingLevel
  const geminiLevel =
    result.generationConfig?.thinkingConfig?.thinkingLevel ||
    result.generationConfig?.thinking_config?.thinkingLevel;
  if (
    typeof geminiLevel === "string" &&
    THINKING_LEVEL_MAP[geminiLevel.toLowerCase()] !== undefined
  ) {
    const rawBudget = THINKING_LEVEL_MAP[geminiLevel.toLowerCase()];
    const budget = capThinkingBudget(result.model || "", rawBudget);
    result.generationConfig = {
      ...result.generationConfig,
      thinkingConfig: { ...result.generationConfig.thinkingConfig, thinkingBudget: budget },
    };
    // Clean up string variants
    if (result.generationConfig.thinkingConfig) {
      delete result.generationConfig.thinkingConfig.thinkingLevel;
    }
    if (result.generationConfig.thinking_config) {
      delete result.generationConfig.thinking_config;
    }
  }

  return result;
}

/**
 * Ensure models with -thinking suffix have thinking config injected.
 * Prevents 400 errors from Claude API when thinking params are missing.
 *
 * @param {object} body - Request body
 * @returns {object} Body with thinking config auto-injected if needed
 */
export function ensureThinkingConfig(body) {
  if (!body || typeof body !== "object") return body;
  const model = body.model || "";

  // Only auto-inject for models with -thinking suffix
  if (!model.endsWith("-thinking")) return body;

  // If thinking config already present, don't override
  if (body.thinking) return body;

  const result = { ...body };
  result.thinking = {
    type: "enabled",
    budget_tokens: getDefaultThinkingBudget(model) || EFFORT_BUDGETS.medium,
  };
  return result;
}

/**
 * Apply thinking budget control to a request body.
 * Called before format-specific translation.
 *
 * Pipeline: normalizeThinkingLevel → ensureThinkingConfig → mode processing
 *
 * @param {object} body - Request body (supported formats)
 * @param {object} [config] - Override config (defaults to stored config)
 * @returns {object} Modified body
 */
export function applyThinkingBudget(body, config = null) {
  const cfg = config || _config;
  if (!body || typeof body !== "object") return body;

  // Early exit: strip ALL reasoning/thinking params for models that don't support them.
  // Sending thinking params to unsupported models (e.g. AG claude-sonnet-4-6) causes 400 errors.
  const modelStr = typeof body.model === "string" ? body.model : "";
  if (modelStr && !supportsReasoning(modelStr)) {
    return stripThinkingConfig(body);
  }

  // Pre-processing: convert string thinkingLevel to numeric budget
  let processed = normalizeThinkingLevel(body);

  // Pre-processing: auto-inject thinking config for -thinking suffix models
  processed = ensureThinkingConfig(processed);

  switch (cfg.mode) {
    case ThinkingMode.AUTO:
      return stripThinkingConfig(processed);

    case ThinkingMode.PASSTHROUGH:
      return processed;

    case ThinkingMode.CUSTOM:
      return setCustomBudget(processed, cfg.customBudget);

    case ThinkingMode.ADAPTIVE:
      return applyAdaptiveBudget(processed, cfg);

    default:
      return processed;
  }
}

/**
 * AUTO mode: strip all thinking configuration, let provider decide
 */
function stripThinkingConfig(body) {
  const result = { ...body };

  // Claude format
  delete result.thinking;

  // OpenAI format
  delete result.reasoning_effort;
  delete result.reasoning;

  // Gemini format
  if (result.generationConfig) {
    result.generationConfig = { ...result.generationConfig };
    delete result.generationConfig.thinking_config;
    delete result.generationConfig.thinkingConfig;
  }

  return result;
}

/**
 * Whether the ORIGINAL (pre-mutation) body already carried an explicit
 * client-supplied thinking/reasoning signal, in any supported format.
 *
 * CRITICAL 2 root cause: `hasThinkingCapableModel` matches on model name
 * alone (`model.includes("gemini")`, etc.), so CUSTOM/ADAPTIVE mode
 * previously injected a `thinking` block onto every thinking-capable-model
 * request regardless of whether the client asked for reasoning at all — a
 * plain title-generation call (`max_tokens: 50`, no reasoning_effort/
 * thinking) got a budget forced onto it purely because the model name
 * matched. This distinguishes that case (injected, nothing to honor) from a
 * genuine client ask (reasoning_effort / thinking / Gemini thinkingConfig
 * already present), so downstream fitting can be more conservative about an
 * injected budget that doesn't naturally fit — see `fitGeminiThinkingBudget`.
 */
function hadExplicitThinkingRequest(body): boolean {
  if (!body || typeof body !== "object") return false;
  if (body.thinking !== undefined) return true;
  if (body.reasoning_effort !== undefined || body.reasoning !== undefined) return true;
  const gc = body.generationConfig;
  if (gc && (gc.thinking_config !== undefined || gc.thinkingConfig !== undefined)) return true;
  return false;
}

/**
 * CUSTOM mode: set exact budget tokens
 */
function setCustomBudget(body, budget) {
  const result = { ...body };
  const clientRequestedThinking = hadExplicitThinkingRequest(body);

  // If body already has thinking config in Claude format, update it
  if (result.thinking || hasThinkingCapableModel(result)) {
    result.thinking = {
      type: budget > 0 ? "enabled" : "disabled",
      budget_tokens: budget,
    };
  }

  // OpenAI reasoning_effort mapping (T11: add 'max' tier for full budget)
  if (result.reasoning_effort !== undefined || result.reasoning !== undefined) {
    if (budget <= 0) {
      delete result.reasoning_effort;
      delete result.reasoning;
    } else if (budget <= 1024) {
      result.reasoning_effort = "low";
    } else if (budget <= 10240) {
      result.reasoning_effort = "medium";
    } else if (budget < 131072) {
      result.reasoning_effort = "high";
    } else {
      result.reasoning_effort = "max"; // T11: full budget → "max"
    }
  }

  // Gemini thinking_config
  if (result.generationConfig?.thinking_config || result.generationConfig?.thinkingConfig) {
    result.generationConfig = {
      ...result.generationConfig,
      thinking_config: { thinking_budget: budget },
    };
  }

  // Tag whether this budget reflects something the client actually asked
  // for vs. one this proxy-wide setting injected onto a request that never
  // mentioned reasoning at all. Read by fitGeminiThinkingBudget's caller
  // (openai-to-gemini.ts) to decide how hard to try fitting it in.
  result.__thinkingClientRequested = clientRequestedThinking;

  return result;
}

/**
 * ADAPTIVE mode: scale budget based on request complexity
 */
function applyAdaptiveBudget(body, cfg) {
  const messages = body.messages || body.input || [];
  const messageCount = messages.length;
  const tools = body.tools || [];
  const toolCount = tools.length;

  // Get last user message length
  let lastMsgLength = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user") {
      lastMsgLength =
        typeof msg.content === "string"
          ? msg.content.length
          : JSON.stringify(msg.content || "").length;
      break;
    }
  }

  // Calculate multiplier
  let multiplier = 1.0;
  if (messageCount > 10) multiplier += 0.5;
  if (toolCount > 3) multiplier += 0.5;
  if (lastMsgLength > 2000) multiplier += 0.3;

  const baseBudget =
    EFFORT_BUDGETS[cfg.effortLevel] ||
    getDefaultThinkingBudget(body.model || "") ||
    EFFORT_BUDGETS.medium;
  const budget = capThinkingBudget(body.model || "", Math.ceil(baseBudget * multiplier));

  return setCustomBudget(body, budget);
}

// CRITICAL 1 (fixed): the answer headroom used to be a flat 8192 constant
// subtracted from the client's cap before fitting the thinking budget. Any
// `max_tokens <= 8192` — and 4096/8192 are the two most common
// OpenAI-compatible client defaults — left ZERO room for the budget,
// pinning reasoning at the model's bare minimum floor (128 for Pro) no
// matter how much reasoning the caller asked for.
//
// Fix: reserve a FRACTION of the available output budget instead of a fixed
// amount, capped at a maximum so huge caps don't over-reserve. This
// guarantees the answer always keeps at least half of maxOutputTokens (or
// the cap, whichever is smaller), while a modest cap still leaves a
// meaningful, non-floor amount for thinking:
//   maxOutputTokens=1024  -> headroom=512   -> thinking room=512
//   maxOutputTokens=2048  -> headroom=1024  -> thinking room=1024
//   maxOutputTokens=4096  -> headroom=2048  -> thinking room=2048
//   maxOutputTokens=8192  -> headroom=4096  -> thinking room=4096
//   maxOutputTokens=16384 -> headroom=8192  -> thinking room=8192
//   maxOutputTokens=32768 -> headroom=8192  -> thinking room=24576
//   maxOutputTokens=65536 -> headroom=8192  -> thinking room=57344
const GEMINI_THINKING_ANSWER_HEADROOM_CAP = 8192;

function geminiAnswerHeadroom(maxOutputTokens: number): number {
  return Math.min(GEMINI_THINKING_ANSWER_HEADROOM_CAP, Math.floor(maxOutputTokens / 2));
}

/**
 * Whether a Gemini model can accept thinkingBudget: 0 (thinking fully
 * disabled), and the minimum non-zero budget it requires once thinking IS
 * enabled. Both come from `MODEL_SPECS` (`mandatoryThinking` /
 * `minThinkingBudgetWhenEnabled`) via `getModelSpec`'s normal exact-match /
 * alias / longest-prefix resolution — the SAME resolution used everywhere
 * else a model's caps are looked up (`capMaxOutputTokens`,
 * `capThinkingBudget`). MEDIUM 7 (fixed): this used to be a second,
 * independent EXACT-match-only classifier that could disagree with the
 * spec's own prefix classifier (e.g. "gemini-2.5-flash-lite-preview-06-17"
 * matched the Flash-Lite MODEL_SPECS prefix rule but not this module's
 * hardcoded exact-match Set, silently emitting a sub-floor thinkingBudget).
 * Driving both from one lookup makes that class of disagreement impossible.
 */
function canDisableGeminiThinking(modelId: string): boolean {
  return getModelSpec(modelId)?.mandatoryThinking !== true;
}

function minEnabledGeminiThinkingBudget(modelId: string): number {
  return getModelSpec(modelId)?.minThinkingBudgetWhenEnabled ?? 0;
}

export type GeminiThinkingFit = {
  maxOutputTokens: number;
  thinkingBudgetTokens: number;
  // true when thinkingConfig should be omitted entirely rather than sent
  // with thinkingBudgetTokens (0 or otherwise) — either because nothing was
  // requested and the model can't accept an explicit 0, or because no valid
  // budget fits within maxOutputTokens and degrading silently (HARD
  // CONSTRAINT F) is safer than emitting an invalid request or throwing.
  omitThinkingConfig: boolean;
};

/**
 * Reconcile Gemini `maxOutputTokens` and `thinkingConfig.thinkingBudget` so the
 * thinking budget never starves the visible answer, WITHOUT ever raising an
 * explicit client-supplied `max_tokens` cap above the model's real ceiling,
 * and WITHOUT ever throwing (HARD CONSTRAINT A) — a throw here aborts an
 * entire combo/fallback chain upstream instead of letting the request
 * degrade gracefully or roll to the next provider.
 *
 * Gemini's maxOutputTokens caps the *combined* thought + answer token count.
 * A small requested max_tokens paired with a large thinking budget (e.g.
 * reasoning_effort: "high") lets the entire budget be consumed by thoughts,
 * so the model returns empty visible content.
 *
 * The requested budget is ALWAYS capped by the model's declared
 * `thinkingBudgetCap` (via `capThinkingBudget`) before any headroom fitting
 * below, regardless of which caller/format produced it — this is what keeps
 * an unbounded Claude-format `thinking.budget_tokens` (e.g. 200000) or a
 * `reasoning_effort: "high"` tier from reaching a model whose real cap is
 * smaller (e.g. 24576 on Flash/Flash-Lite).
 *
 * Two cases for maxOutputTokens:
 *  - The client did NOT set an explicit `max_tokens`: our own default
 *    maxOutputTokens (`capMaxOutputTokens` with no requested value — capped
 *    at the safe default ceiling, see modelSpecs.ts) is what we're free to
 *    fill. The thinking budget is clamped down to fit
 *    `cap - geminiAnswerHeadroom(cap)`.
 *  - The client DID set an explicit `max_tokens`: that cap is authoritative
 *    for cost control and must NEVER be exceeded (though it is still capped
 *    at the model's real ceiling — a client cannot request more than the
 *    model supports either). The thinking budget is shrunk to fit within
 *    `max_tokens - geminiAnswerHeadroom(max_tokens)` (down to 0 when the
 *    model allows disabling thinking) so the answer still gets room, while
 *    the client's requested ceiling is honored exactly.
 *
 * In both cases, once the fitted budget would land below the model's
 * mandatory minimum enabled budget (0-but-can't-disable for "Pro" models, or
 * a non-zero floor like Flash-Lite's 512):
 *  - If the caller genuinely asked for reasoning (`clientRequestedThinking`),
 *    clamp UP to that floor instead of silently zeroing it — omitting drops
 *    the caller's reasoning request entirely.
 *  - If this budget was purely proxy-injected (CUSTOM/ADAPTIVE mode forcing
 *    a budget onto a request that never mentioned reasoning at all —
 *    CRITICAL 2), do NOT force extra tokens onto a call that didn't ask for
 *    any: leave it at the naturally-fitted (possibly sub-floor) amount and
 *    let the disable/omit path below handle it.
 *
 * If the (possibly floor-clamped) budget would land AT OR ABOVE
 * `maxOutputTokens` — `>=`, not `>`: equality still starves the answer to
 * zero visible tokens (CRITICAL 3) — the model degrades instead of erroring:
 *  - If the model CAN disable thinking outright (`canDisableGeminiThinking`),
 *    disable it (budget: 0) — always safe, never exceeds the cap.
 *  - If the model CANNOT disable thinking (Pro family) and even the floor
 *    doesn't fit, omit thinkingConfig entirely (HARD CONSTRAINT F) instead
 *    of throwing or emitting `thinkingBudget >= maxOutputTokens`. The model
 *    falls back to its own dynamic thinking behavior; the alternative
 *    (a 400) would abort the whole request/fallback chain for what is often
 *    just a very small `max_tokens` on a side-call that barely cares about
 *    reasoning at all.
 *
 * `maxOutputTokens` itself is NEVER raised past the client's cap in any of
 * the above (HARD CONSTRAINT B) — only the budget is adjusted (down, up to
 * its floor when genuinely requested, to 0, or omitted).
 *
 * @param modelId - target model id (for the per-model output cap)
 * @param clientMaxTokens - the RAW, unclamped client-supplied `max_tokens`
 *   (undefined/null when the client did not set one). Must NOT be
 *   pre-clamped by the caller — this function needs to distinguish "client
 *   asked for 8192" from "client asked for nothing and we defaulted to
 *   8192", which an already-clamped value cannot express.
 * @param thinkingBudgetTokens - thinkingConfig.thinkingBudget being requested,
 *   RAW and unclamped (this function applies `capThinkingBudget` itself).
 * @param clientRequestedThinking - whether the ORIGINAL client actually asked
 *   for reasoning (reasoning_effort / thinking / thinkingConfig already on
 *   the request), as opposed to a budget the proxy's CUSTOM/ADAPTIVE mode
 *   injected onto a request that never mentioned it. Defaults to true (the
 *   safe, "try hard to honor it" behavior for ordinary passthrough clients).
 */
export function fitGeminiThinkingBudget(
  modelId: string,
  clientMaxTokens: number | undefined | null,
  thinkingBudgetTokens: number,
  clientRequestedThinking: boolean = true
): GeminiThinkingFit {
  const canDisable = canDisableGeminiThinking(modelId);
  const minEnabledBudget = minEnabledGeminiThinkingBudget(modelId);
  const clientSetMaxTokens =
    typeof clientMaxTokens === "number" && Number.isFinite(clientMaxTokens);
  const thinkingRequested = Number.isFinite(thinkingBudgetTokens) && thinkingBudgetTokens > 0;
  // Cap the requested budget by this model's declared ceiling up front, so
  // every caller (reasoning_effort tiers or a raw Claude-format
  // `thinking.budget_tokens` passthrough) is bounded the same way before any
  // headroom fitting below.
  const requestedBudget = thinkingRequested ? capThinkingBudget(modelId, thinkingBudgetTokens) : 0;

  const finalize = (maxOutputTokens: number, fittedBudget: number): GeminiThinkingFit => {
    if (!thinkingRequested) {
      // Nothing was actually requested (defensive: real call sites only
      // invoke this function when reasoning was requested).
      if (!canDisable) {
        return { maxOutputTokens, thinkingBudgetTokens: 0, omitThinkingConfig: true };
      }
      return { maxOutputTokens, thinkingBudgetTokens: 0, omitThinkingConfig: false };
    }

    if (!clientRequestedThinking && fittedBudget < minEnabledBudget) {
      // Purely proxy-injected reasoning that doesn't naturally reach the
      // model's mandatory floor within the available headroom. The client
      // never asked for this — do not force extra tokens onto their
      // request just to satisfy a floor they have no stake in; degrade the
      // same way as "nothing requested" above.
      if (!canDisable) {
        return { maxOutputTokens, thinkingBudgetTokens: 0, omitThinkingConfig: true };
      }
      return { maxOutputTokens, thinkingBudgetTokens: 0, omitThinkingConfig: false };
    }

    // Thinking WAS genuinely requested: clamp up to the model's mandatory
    // minimum enabled budget rather than collapsing to 0 or omitting
    // entirely.
    const budget = Math.max(fittedBudget, minEnabledBudget);
    // `>=`, not `>`: budget === maxOutputTokens still leaves zero room for
    // the visible answer (CRITICAL 3).
    if (budget >= maxOutputTokens) {
      if (canDisable) {
        // The mandatory-if-enabled floor doesn't fit this cap, but the model
        // allows disabling thinking outright — disabling is always safe and
        // keeps `thinkingBudget <= maxOutputTokens` by construction.
        return { maxOutputTokens, thinkingBudgetTokens: 0, omitThinkingConfig: false };
      }
      // Cannot disable and even the floor doesn't fit: degrade by omitting
      // thinkingConfig (HARD CONSTRAINT F) instead of throwing (HARD
      // CONSTRAINT A) or emitting an invalid thinkingBudget >= maxOutputTokens.
      return { maxOutputTokens, thinkingBudgetTokens: 0, omitThinkingConfig: true };
    }
    return { maxOutputTokens, thinkingBudgetTokens: budget, omitThinkingConfig: false };
  };

  if (!thinkingRequested) {
    const maxOutputTokens = clientSetMaxTokens
      ? capMaxOutputTokens(modelId, clientMaxTokens as number)
      : capMaxOutputTokens(modelId);
    return finalize(maxOutputTokens, 0);
  }

  if (!clientSetMaxTokens) {
    const ownDefaultMaxOutputTokens = capMaxOutputTokens(modelId);
    const budgetFittingCap = Math.max(
      0,
      ownDefaultMaxOutputTokens - geminiAnswerHeadroom(ownDefaultMaxOutputTokens)
    );
    return finalize(ownDefaultMaxOutputTokens, Math.min(requestedBudget, budgetFittingCap));
  }

  // Client's cap is authoritative — never raise it, but still bound it by
  // the model's real ceiling (a client cannot ask for more than the model
  // supports).
  const maxOutputTokens = capMaxOutputTokens(modelId, clientMaxTokens as number);
  const maxBudgetForAnswer = Math.max(0, maxOutputTokens - geminiAnswerHeadroom(maxOutputTokens));
  return finalize(maxOutputTokens, Math.min(requestedBudget, maxBudgetForAnswer));
}

/**
 * Check if model name suggests thinking capability
 */
export function hasThinkingCapableModel(body) {
  const model = body.model || "";
  return (
    model.includes("claude") ||
    model.includes("o1") ||
    model.includes("o3") ||
    model.includes("o4") ||
    model.includes("gemini") ||
    model.endsWith("-thinking") ||
    model.includes("thinking")
  );
}
