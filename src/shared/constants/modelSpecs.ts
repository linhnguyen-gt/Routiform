/**
 * Centralized specifications for AI Models.
 * Contains maximum token caps and thinking budgets to prevent API errors
 * when clients request more than the model supports.
 */

import { CONTEXT_CONFIG } from "./context";

export interface ModelSpec {
  maxOutputTokens: number;
  contextWindow?: number;
  defaultThinkingBudget?: number;
  thinkingBudgetCap?: number;
  thinkingOverhead?: number; // buffer de tokens para thinking
  adaptiveMaxTokens?: number; // tokens disponíveis para output quando thinking ativo
  aliases?: string[]; // IDs alternativos para este modelo
  supportsThinking?: boolean;
  supportsTools?: boolean;
  supportsVision?: boolean;
  // Whether this model can accept thinkingBudget: 0 (thinking fully
  // disabled). Some Gemini "Pro" tiers reject 0 with a hard 400
  // INVALID_ARGUMENT and must always keep a non-zero thinking budget once
  // thinking is enabled. Undefined/false means thinking CAN be disabled
  // (the common case).
  mandatoryThinking?: boolean;
  // Minimum non-zero thinkingBudget this model accepts once thinking is
  // enabled (0 is handled separately via `mandatoryThinking`/disabling).
  // Undefined defaults to 0 (no floor beyond "disabled").
  minThinkingBudgetWhenEnabled?: number;
}

const GPT_5_CONTEXT_WINDOW = 400000;
const GPT_5_MAX_OUTPUT_TOKENS = 128000;

const GPT_5_TEXT_VISION_SPEC: ModelSpec = {
  maxOutputTokens: GPT_5_MAX_OUTPUT_TOKENS,
  contextWindow: GPT_5_CONTEXT_WINDOW,
  supportsTools: true,
  supportsVision: true,
};

// Verified 2026-07-12 against https://developers.openai.com/api/docs/models/gpt-5.5,
// gpt-5.6-terra, gpt-5.6-luna and gpt-5.6-sol (each lists "1,050,000 context window"
// and "128,000 max output tokens").
const GPT_5_6_CONTEXT_WINDOW = 1050000;

const GPT_5_6_TEXT_VISION_SPEC: ModelSpec = {
  maxOutputTokens: GPT_5_MAX_OUTPUT_TOKENS,
  contextWindow: GPT_5_6_CONTEXT_WINDOW,
  supportsTools: true,
  supportsVision: true,
};

export const MODEL_SPECS: Record<string, ModelSpec> = {
  // ── GPT-5 / Codex multimodal series ──────────────────────────────
  "gpt-5": GPT_5_TEXT_VISION_SPEC,
  "gpt-5-mini": GPT_5_TEXT_VISION_SPEC,
  "gpt-5-nano": GPT_5_TEXT_VISION_SPEC,
  "gpt-5-codex": GPT_5_TEXT_VISION_SPEC,
  "gpt-5.1": GPT_5_TEXT_VISION_SPEC,
  "gpt-5.1-codex": GPT_5_TEXT_VISION_SPEC,
  "gpt-5.1-codex-mini": GPT_5_TEXT_VISION_SPEC,
  "gpt-5.1-codex-max": GPT_5_TEXT_VISION_SPEC,
  "gpt-5.2": GPT_5_TEXT_VISION_SPEC,
  "gpt-5.2-codex": GPT_5_TEXT_VISION_SPEC,
  "gpt-5.3-codex": GPT_5_TEXT_VISION_SPEC,
  "gpt-5.4": GPT_5_TEXT_VISION_SPEC,
  "gpt-5.4-mini": GPT_5_TEXT_VISION_SPEC,
  // ── Current Codex CLI lineup (2026-07-12): larger 1.05M context window ──
  "gpt-5.5": GPT_5_6_TEXT_VISION_SPEC,
  "gpt-5.6-terra": GPT_5_6_TEXT_VISION_SPEC,
  "gpt-5.6-luna": GPT_5_6_TEXT_VISION_SPEC,
  "gpt-5.6-sol": GPT_5_6_TEXT_VISION_SPEC,

  // ── Gemini 3.7 / 3.6 Flash ──────────────────────────────────────
  // Both are advertised at 1M input / 64K output and both support tunable
  // thinking (low/medium/high, default medium) — 3.7 is built on the 3.6
  // architecture and ships the same tool suite:
  //   https://ai.google.dev/gemini-api/docs/latest-model
  //   https://deepmind.google/models/model-cards/gemini-3-7-flash/
  //
  // No `aliases` list is needed for the Antigravity tier suffixes
  // (`-low`, `-medium`, `-high`, `-tiered`, `-extra-low`): lookupSpec's
  // longest-prefix pass already resolves "gemini-3.7-flash-high" here.
  // The older "gemini-3-flash" key could NOT cover them — "gemini-3.6-flash-low"
  // does not start with "gemini-3-flash" — so every 3.6/3.7 tier id fell through
  // to `__default__` and was capped at 8192 output instead of 65536.
  //
  // No thinkingBudgetCap is set: the 3.x family is driven by `thinking_level`
  // rather than a numeric budget, and Antigravity strips thinkingConfig outright
  // (see open-sse/services/antigravityThinkingConfig.ts), so any number here
  // would be invented rather than published.
  "gemini-3.7-flash": {
    maxOutputTokens: 65536,
    contextWindow: 1048576,
    supportsThinking: true,
    supportsTools: true,
    supportsVision: true,
  },
  "gemini-3.6-flash": {
    maxOutputTokens: 65536,
    contextWindow: 1048576,
    supportsThinking: true,
    supportsTools: true,
    supportsVision: true,
  },

  // ── Gemini 3 Flash series ───────────────────────────────────────
  "gemini-3-flash": {
    maxOutputTokens: 65536,
    contextWindow: 1048576,
    defaultThinkingBudget: 0,
    thinkingBudgetCap: 0,
    supportsThinking: false,
    supportsTools: true,
    supportsVision: true,
    // "gemini-3.1-flash-lite" inherits the limits already assigned to its
    // retired preview twin — same model, the preview suffix was dropped when
    // it went GA. The retired id stays so old configs still size correctly.
    aliases: ["gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-3.1-flash-lite-preview"],
  },
  "gemini-3.5-flash": {
    maxOutputTokens: 65536,
    contextWindow: 1048576,
    defaultThinkingBudget: 0,
    thinkingBudgetCap: 0,
    supportsThinking: false,
    supportsTools: true,
    supportsVision: true,
  },

  // ── Gemini 3.5 Flash Low / Medium Fast (Antigravity) ─────────────
  "gemini-3.5-flash-low": {
    maxOutputTokens: 65536,
    contextWindow: 1048576,
    defaultThinkingBudget: 0,
    thinkingBudgetCap: 0,
    supportsThinking: false,
    supportsTools: true,
    supportsVision: true,
    aliases: ["gemini-3.1-flash-image"],
  },

  // ── Gemini 3.1 Pro High ─────────────────────────────────────────
  // "gemini-3-pro-preview" is deliberately an ALIAS here, not its own entry:
  // per https://ai.google.dev/gemini-api/docs/models/gemini-3-pro-preview
  // it is deprecated (shut down 2026-03-09) with Google's own migration
  // guidance pointing to gemini-3.1-pro-preview — which this entry already
  // aliases — and it shares the same output ceiling (65,536, confirmed on
  // that page) and mandatory-thinking / 32768-cap behavior as the rest of
  // the Gemini 3.x Pro family (see `mandatoryThinking` /
  // `minThinkingBudgetWhenEnabled` below, consumed by thinkingBudget.ts's
  // canDisableGeminiThinking/minEnabledGeminiThinkingBudget). Duplicating a
  // second, near-identical spec object for a model Google itself says to
  // stop using would violate DRY for no benefit.
  "gemini-3.1-pro-high": {
    maxOutputTokens: 65535,
    contextWindow: 1048576,
    defaultThinkingBudget: 24576,
    thinkingBudgetCap: 32768,
    thinkingOverhead: 1000,
    supportsThinking: true,
    supportsTools: true,
    supportsVision: true,
    // thinking_level "minimal" (no-thinking) is explicitly "Not supported"
    // for Gemini 3.x Pro — https://ai.google.dev/gemini-api/docs/gemini-3.
    // The legacy thinking_budget path remains accepted for backward
    // compatibility, so the same 128-token floor as 2.5 Pro is applied
    // conservatively (no published lower minimum exists for this path).
    mandatoryThinking: true,
    minThinkingBudgetWhenEnabled: 128,
    aliases: [
      "gemini-3-pro-high",
      "gemini-3-pro-preview",
      "gemini-3.1-pro-preview",
      "gemini-3.1-pro-preview-customtools",
    ],
  },

  // ── Gemini 3.1 Pro Low ──────────────────────────────────────────
  "gemini-3.1-pro-low": {
    maxOutputTokens: 65535,
    contextWindow: 1048576,
    defaultThinkingBudget: 8192,
    thinkingBudgetCap: 16000,
    supportsThinking: true,
    supportsTools: true,
    supportsVision: true,
    mandatoryThinking: true,
    minThinkingBudgetWhenEnabled: 128,
    aliases: ["gemini-3-pro-low"],
  },

  // ── Gemini 2.5 series ─────────────────────────────────────────────
  // Verified 2026-07-12 against the live per-model pages (each states
  // "Input token limit: 1,048,576" / "Output token limit: 65,536"):
  //   https://ai.google.dev/gemini-api/docs/models/gemini-2.5-pro
  //   https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash
  //   https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite
  // thinkingBudgetCap / mandatoryThinking / minThinkingBudgetWhenEnabled
  // values below cite https://ai.google.dev/gemini-api/docs/thinking's
  // thinkingBudget table:
  // 2.5 Pro 128-32768 (cannot disable), 2.5 Flash 0-24576 (0 disables),
  // 2.5 Flash-Lite 512-24576 when enabled / 0 disables.
  // HIGH 5 (fixed): defaultThinkingBudget for gemini-2.5-pro was 128 — that
  // is the MINIMUM enabled budget (see minThinkingBudgetWhenEnabled below),
  // not the default. Google's documented default thinking allocation for
  // "medium" effort is 8192 (matches this proxy's own THINKING_LEVEL_MAP
  // .medium and the openai-to-gemini.ts budgetMap fallback literal already
  // in use). A truthy-but-tiny 128 here was silently selected as the
  // "medium" reasoning_effort budget instead of falling through to a sane
  // default. gemini-2.5-flash/-flash-lite keep 0: their default thinking
  // state is legitimately "off until the client asks", and 0 is falsy so
  // `getDefaultThinkingBudget(model) || 8192` already falls through to the
  // same sane 8192 default for their "medium" tier — no bug there.
  "gemini-2.5-pro": {
    maxOutputTokens: 65536,
    contextWindow: 1048576,
    defaultThinkingBudget: 8192,
    thinkingBudgetCap: 32768,
    supportsThinking: true,
    supportsTools: true,
    supportsVision: true,
    // Cannot disable thinking (thinkingBudget: 0 is a hard 400
    // INVALID_ARGUMENT) — https://ai.google.dev/gemini-api/docs/thinking.
    mandatoryThinking: true,
    minThinkingBudgetWhenEnabled: 128,
  },
  "gemini-2.5-flash": {
    maxOutputTokens: 65536,
    contextWindow: 1048576,
    defaultThinkingBudget: 0,
    thinkingBudgetCap: 24576,
    supportsThinking: true,
    supportsTools: true,
    supportsVision: true,
  },
  "gemini-2.5-flash-lite": {
    maxOutputTokens: 65536,
    contextWindow: 1048576,
    defaultThinkingBudget: 0,
    thinkingBudgetCap: 24576,
    supportsThinking: true,
    supportsTools: true,
    supportsVision: true,
    // Requires a non-zero minimum budget once thinking is enabled (0 is
    // still valid to disable it outright) — same source as gemini-2.5-pro.
    minThinkingBudgetWhenEnabled: 512,
  },

  // ── Claude Opus 4.5 ─────────────────────────────────────────────
  "claude-opus-4-5": {
    maxOutputTokens: 32768,
    contextWindow: CONTEXT_CONFIG.defaultLimit,
    defaultThinkingBudget: 10000,
    thinkingBudgetCap: 32000,
    supportsThinking: true,
    supportsTools: true,
    supportsVision: true,
  },

  // Defaults
  // 32768 (was 8192): models missing from MODEL_SPECS still get a usable
  // default output ceiling. capMaxOutputTokens still clamps an explicit
  // client max_tokens by this, so a client asking 64K on an unknown model
  // now gets 32K instead of 8K — upstreams that truly cannot serve that
  // much reject the request themselves, which is the pre-existing behavior
  // for any unregistered cap mismatch.
  __default__: {
    maxOutputTokens: 32768,
  },
};

function lookupSpec(modelId: string): ModelSpec | undefined {
  if (MODEL_SPECS[modelId]) return MODEL_SPECS[modelId];

  // Buscas por alias
  for (const [_canonical, spec] of Object.entries(MODEL_SPECS)) {
    if (spec.aliases?.includes(modelId)) return spec;
  }

  // Prefix matching: pick the LONGEST matching canonical key so a more
  // specific family always wins over a shorter, less specific one,
  // regardless of object insertion order. Object.entries iteration order
  // previously decided the winner (MEDIUM 7): "gemini-2.5-flash" was
  // inserted before "gemini-2.5-flash-lite", so
  // "gemini-2.5-flash-lite-preview-06-17" (which starts with both) resolved
  // to the plain Flash spec instead of Flash-Lite's — silently applying the
  // wrong thinkingBudgetCap/minThinkingBudgetWhenEnabled for an unregistered
  // but live-catalog model id.
  let bestKey = "";
  let bestSpec: ModelSpec | undefined;
  for (const [key, spec] of Object.entries(MODEL_SPECS)) {
    if (key === "__default__") continue;
    if (modelId.startsWith(key) && key.length > bestKey.length) {
      bestKey = key;
      bestSpec = spec;
    }
  }

  return bestSpec;
}

/**
 * Resolve a model id to its spec.
 *
 * Ids arrive here in two shapes. Callers that take the model as an argument
 * pass it bare (`claude-opus-4-5`). Callers that read it off the request body
 * get whatever the routing layer stamped there, which is provider-qualified —
 * `anthropic/claude-opus-4-5` on the ordinary path, and OpenRouter-style
 * multi-segment ids elsewhere. No canonical key or alias contains "/", so a
 * qualified id could not match exactly, by alias, or by prefix: the lookup
 * returned undefined and every ceiling it feeds silently became "no limit" —
 * `thinkingBudgetCap` stopped clamping, `defaultThinkingBudget` stopped
 * applying, `maxOutputTokens` fell through to the generic default.
 *
 * Retrying on the last path segment is a strict widening: an id that already
 * resolves is untouched, so only lookups that previously found nothing can
 * change. That confines the effect to exactly the ids the caps were meant to
 * cover and never reinterprets one that already matched.
 */
export function getModelSpec(modelId: string): ModelSpec | undefined {
  const direct = lookupSpec(modelId);
  if (direct) return direct;

  const lastSlash = modelId.lastIndexOf("/");
  if (lastSlash === -1) return undefined;

  return lookupSpec(modelId.slice(lastSlash + 1));
}

// Safe default output ceiling applied ONLY when the client omits max_tokens
// entirely. Originally 8192 (the __default__ placeholder), lowered to 16384
// when the Gemini 2.5 family gained real 65536 specs (HIGH 6) to stop a
// missing client field from silently 8x-ing billable output. Raised back to
// 65536 by demand: 16384 truncated long completions (the most common
// "output too short" report) and the thinking-budget path already reserves
// answer headroom inside whatever cap is chosen, so a larger default no
// longer risks starving the visible answer. A client that wants a smaller
// ceiling can always send an explicit max_tokens.
export const SAFE_DEFAULT_MAX_OUTPUT_TOKENS = 65536;

export function capMaxOutputTokens(modelId: string, requested?: number): number {
  const spec = getModelSpec(modelId);
  const cap = spec?.maxOutputTokens ?? MODEL_SPECS.__default__.maxOutputTokens;
  // LOW 9 (fixed): `requested ? ... : cap` treated `max_tokens: 0` (a valid,
  // if unusual, explicit client request) as falsy and silently returned the
  // FULL cap instead of honoring the client's literal 0. Check the type
  // instead of truthiness.
  if (typeof requested === "number" && Number.isFinite(requested)) {
    return Math.min(requested, cap);
  }
  // No explicit client request: never hand out more than the safe default
  // ceiling, even if the model's real cap is much larger.
  return Math.min(cap, SAFE_DEFAULT_MAX_OUTPUT_TOKENS);
}

export function getDefaultThinkingBudget(modelId: string): number {
  return getModelSpec(modelId)?.defaultThinkingBudget ?? 0;
}

export function capThinkingBudget(modelId: string, budget: number): number {
  const cap = getModelSpec(modelId)?.thinkingBudgetCap ?? budget;
  return Math.min(budget, cap);
}

// LOW 10 (fixed): renamed from `resolveModelAlias` — a function with the
// identical name and a DIFFERENT meaning already exists in
// open-sse/services/modelDeprecation.ts (resolves a deprecated/legacy model
// id to its current replacement, e.g. "gemini-pro" -> "gemini-2.5-pro").
// This one instead resolves one of THIS module's `MODEL_SPECS[...].aliases`
// entries back to its canonical spec key (e.g. "gemini-3.1-pro-preview" ->
// "gemini-3.1-pro-high"). Two same-named, differently-behaved functions
// invited exactly the kind of cross-module confusion this codebase keeps
// re-hitting; only this module's copy is renamed since modelDeprecation.ts
// is owned by a different subsystem.
export function resolveSpecAlias(modelId: string): string {
  for (const [canonical, spec] of Object.entries(MODEL_SPECS)) {
    if (spec.aliases?.includes(modelId)) return canonical;
  }
  return modelId;
}
