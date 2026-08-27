/**
 * Applies model-level default params to an already-translated request body.
 *
 * Reasoning effort needs special handling: it is stored in the Responses-API shape
 * (`reasoning: { effort }`), but by the time defaults are applied the body is already in
 * the target provider's format. Copying the stored shape verbatim only works for Codex
 * and the Responses API — every other provider reads a different field and silently
 * ignores (or rejects) a stray `reasoning` object. So the effort is re-expressed in the
 * shape the target format actually reads.
 */

import { FORMATS } from "../../translator/formats.ts";
import { getDefaultParams } from "../../config/registry-params.ts";
import type { HandlerLogger, JsonRecord } from "../types/chat-core.ts";
import { downgradeReasoningEffort } from "./chat-core-reasoning-effort-support.ts";

/** Formats whose request body carries the effort as a nested `reasoning.effort`. */
const NESTED_EFFORT_FORMATS = new Set<string>([
  FORMATS.CODEX,
  FORMATS.OPENAI_RESPONSES,
  FORMATS.OPENAI_RESPONSE,
]);

function isPlainObject(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readEffort(value: unknown): string | null {
  if (!isPlainObject(value)) return null;
  const effort = value.effort;
  return typeof effort === "string" && effort.trim() ? effort.trim().toLowerCase() : null;
}

/** True when the body already asks for a specific amount of reasoning. */
function bodyAlreadyRequestsReasoning(body: JsonRecord): boolean {
  if (readEffort(body.reasoning)) return true;
  if (typeof body.reasoning_effort === "string") return true;
  if (body.thinking !== undefined) return true;
  const generationConfig = body.generationConfig;
  if (isPlainObject(generationConfig)) {
    if (generationConfig.thinking_config !== undefined) return true;
    if (generationConfig.thinkingConfig !== undefined) return true;
  }
  return false;
}

/**
 * Write a default reasoning effort into `body` using the field the target format reads.
 * A default never overrides an effort the request already carries.
 */
function applyDefaultReasoningEffort({
  body,
  effort,
  targetFormat,
  provider,
  log,
}: {
  body: JsonRecord;
  effort: string;
  targetFormat: string;
  provider: string;
  log?: HandlerLogger | null;
}): void {
  if (bodyAlreadyRequestsReasoning(body)) return;

  if (NESTED_EFFORT_FORMATS.has(targetFormat)) {
    // The Codex transform normalizes and clamps this per-model further downstream.
    body.reasoning = { ...(isPlainObject(body.reasoning) ? body.reasoning : {}), effort };
    log?.debug?.("PARAMS", `Applied default reasoning.effort=${effort} for ${provider}`);
    return;
  }

  if (targetFormat === FORMATS.OPENAI) {
    const downgraded = downgradeReasoningEffort(provider, effort);
    if (!downgraded) {
      log?.debug?.("PARAMS", `Skipped default reasoning effort for ${provider} (not supported)`);
      return;
    }
    body.reasoning_effort = downgraded.effort;
    if (downgraded.reason) log?.debug?.("PARAMS", downgraded.reason);
    log?.debug?.("PARAMS", `Applied default reasoning_effort=${downgraded.effort} for ${provider}`);
    return;
  }

  // Remaining formats (claude, gemini, kiro, cursor, antigravity, commandcode, devin)
  // express reasoning through their own shapes. Injecting the stored one would add a
  // field they do not read, so the default is skipped rather than sent in a shape that
  // cannot work.
  //
  // Claude is deliberately in that list even though the mapping is known — a thinking
  // budget has to be clamped against the model's `thinkingBudgetCap`, its `maxOutputTokens`
  // and the provider's token cap, and the temperature has to be forced. Every one of those
  // passes runs upstream of this point, so a budget written here would reach Anthropic
  // unclamped and 400. Sizing Claude thinking from a stored default therefore belongs
  // before translation, not here.
  log?.debug?.(
    "PARAMS",
    `Skipped default reasoning effort=${effort} for ${provider} (unsupported target format ${targetFormat})`
  );
}

/**
 * Copy model-level defaults into the request body. Values already present on the body win,
 * since a default is only a fallback for what the client did not ask for.
 */
export function applyModelDefaultParams({
  body,
  defaultParams,
  targetFormat,
  provider,
  log,
}: {
  body: JsonRecord;
  defaultParams: Record<string, unknown>;
  targetFormat: string;
  provider: string;
  log?: HandlerLogger | null;
}): void {
  for (const [key, value] of Object.entries(defaultParams)) {
    if (key === "reasoning") {
      const effort = readEffort(value);
      if (effort) {
        applyDefaultReasoningEffort({ body, effort, targetFormat, provider, log });
        continue;
      }
    }
    if (body[key] === undefined) body[key] = value;
  }
}

/**
 * Formats whose translator reads `reasoning_effort` from the PRE-translation
 * (openai-shape) body and converts it into their native thinking shape with the
 * right per-model clamping applied: openai-to-claude (#627 effort→budget map),
 * openai-to-gemini / openai-to-antigravity (thinkingConfig fitting), and
 * openai-to-kiro (adaptive thinking). Injecting the stored default into the
 * inbound body for these targets lets a default ride the exact same ladder a
 * client-supplied effort does — every cap the post-translate skip below was
 * written to protect is applied by the translators themselves.
 */
const PRE_TRANSLATE_EFFORT_FORMATS: Record<string, true> = {
  [FORMATS.CLAUDE]: true,
  [FORMATS.GEMINI]: true,
  [FORMATS.KIRO]: true,
  [FORMATS.ANTIGRAVITY]: true,
};

/**
 * Inject a model-level reasoning-effort default into the INBOUND (pre-translation)
 * body as `reasoning_effort`, for the target formats whose translators consume that
 * field. Runs before `translateInboundRequestBody`, so the translator's own clamping
 * (Claude budget map + max_tokens bump, Gemini/AG fitGeminiThinkingBudget, Kiro
 * adaptive) sizes the native thinking shape — the thing a post-translate write
 * cannot do safely, which is why those formats were skipped there.
 *
 * A default never overrides reasoning the request already carries. Formats with no
 * pre-translate consumer (openai, codex, responses, cursor, commandcode, devin) are
 * left to the post-translate pass, which already handles them.
 */
export function injectPreTranslateEffortDefault({
  body,
  provider,
  model,
  targetFormat,
  log,
}: {
  body: JsonRecord;
  provider: string;
  model: string;
  targetFormat: string;
  log?: HandlerLogger | null;
}): void {
  if (!PRE_TRANSLATE_EFFORT_FORMATS[targetFormat]) return;
  if (bodyAlreadyRequestsReasoning(body)) return;

  const defaultParams = getDefaultParams(provider, model);
  const effort = defaultParams ? readEffort(defaultParams.reasoning) : null;
  if (!effort) return;

  body.reasoning_effort = effort;
  log?.debug?.(
    "PARAMS",
    `Injected pre-translation reasoning_effort=${effort} for ${provider}/${model}`
  );
}
