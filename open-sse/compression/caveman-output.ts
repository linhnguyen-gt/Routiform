import { appendSystemDirective } from "./append-system-directive.ts";
import { canInjectSystemDirective } from "./directive-gates.ts";
import type { CavemanOutputLevel, CavemanOutputResult } from "./types.ts";

/**
 * Output-side caveman: a system-prompt directive that makes the *model*
 * emit terser output. Distinct from `caveman-en.ts`, which is an input-side
 * regex rewriter stripping filler from prompt text.
 *
 * Rules the directive must carry — each one exists because omitting it
 * produced wrong output, not merely verbose output:
 *   - no invented abbreviations (guards code symbols / identifiers / error
 *     strings from being mangled)
 *   - preserve the user's language
 *   - no self-reference; no decoration
 *   - no `X -> Y` arrow shorthand (upstream removed this from ULTRA because
 *     models over-applied it; do not re-add it)
 *
 * YAGNI: only `lite` / `full` are shipped. Upstream also has `ultra`,
 * `wenyan`, and `wenyan-ultra` — not ported until someone asks for them.
 */

export const CAVEMAN_LEVELS = {
  LITE: "lite",
  FULL: "full",
} as const satisfies Record<string, Exclude<CavemanOutputLevel, "off">>;

const SHARED_BOUNDARIES =
  "Code blocks, file paths, commands, errors, URLs: keep exact. Security warnings, irreversible action confirmations, multi-step ordered sequences: write normal. Resume terse style after.";

const SHARED_EXAMPLES =
  'Not: "Sure! I\'d be happy to help you with that. The issue you\'re experiencing is likely caused by..." Yes: "Bug in auth middleware. Token expiry check use `<` not `<=`. Fix:"';

const SHARED_AUTO_CLARITY =
  "Auto-Clarity: drop caveman for security warnings, irreversible actions, multi-step sequences where fragment ambiguity risks misread, or when user repeats a question. Resume after the clear part.";

const SHARED_PERSISTENCE =
  "ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift. Still active if unsure.";

const SHARED_NO_INVENTED_ABBREV =
  "No invented abbreviations. Standard well-known tech acronyms (DB, API, HTTP, URL, JSON, ID, OS, CPU) OK. Names of code symbols, function names, API names, error strings: keep verbatim.";

const SHARED_PRESERVE_LANGUAGE =
  "Preserve the user's dominant language. User wrote Vietnamese, reply Vietnamese. User wrote English, reply English. Code identifiers, error strings, file paths, commands: keep in their original form regardless of language.";

const SHARED_NO_SELF_REFERENCE =
  'No self-reference. Do not name or announce the style (no "caveman mode", no "me caveman think", no "compressed mode active"). Just respond.';

const SHARED_NO_DECORATION =
  'No decorative emoji. No narrating tool calls ("I will now search", "I used X to find Y"). No status phrases ("Sure!", "Of course!", "I\'d be happy to"). No causal arrow shorthand ("A -> B -> fails"). State the thing, the action, the reason. Then next step.';

export const CAVEMAN_PROMPTS: Record<Exclude<CavemanOutputLevel, "off">, string> = {
  [CAVEMAN_LEVELS.LITE]: [
    "Respond tersely. Keep grammar and full sentences but drop filler, hedging and pleasantries (just/really/basically/sure/of course/I'd be happy to).",
    "Pattern: state the thing, the action, the reason. Then next step.",
    SHARED_EXAMPLES,
    SHARED_BOUNDARIES,
    SHARED_AUTO_CLARITY,
    SHARED_PERSISTENCE,
    SHARED_NO_INVENTED_ABBREV,
    SHARED_PRESERVE_LANGUAGE,
    SHARED_NO_SELF_REFERENCE,
    SHARED_NO_DECORATION,
  ].join(" "),

  [CAVEMAN_LEVELS.FULL]: [
    "Respond like terse caveman. All technical substance stay exact, only fluff die.",
    "Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries, hedging. Fragments OK. Short synonyms (big not extensive, fix not implement a solution for).",
    "Pattern: [thing] [action] [reason]. [next step].",
    SHARED_EXAMPLES,
    SHARED_BOUNDARIES,
    SHARED_AUTO_CLARITY,
    SHARED_PERSISTENCE,
    SHARED_NO_INVENTED_ABBREV,
    SHARED_PRESERVE_LANGUAGE,
    SHARED_NO_SELF_REFERENCE,
    SHARED_NO_DECORATION,
  ].join(" "),
};

/** Returns the directive text for a level, or `null` for `"off"` / unknown levels. */
export function getCavemanOutputPrompt(level: CavemanOutputLevel): string | null {
  if (level === "off") return null;
  return CAVEMAN_PROMPTS[level] ?? null;
}

/**
 * Injects the output-style directive into the request body's system prompt.
 * Mutates `body` in place. No-op (returns `null`) when `level` is `"off"` —
 * this keeps the default request byte-identical to today. Also a no-op for
 * forced tool calls or structured-output (JSON schema) requests, where a
 * prose-terseness directive is either meaningless or actively dangerous.
 *
 * `body` and `gateBody` are deliberately separate parameters:
 *   - `body` is what gets MUTATED — it must be the body that actually goes
 *     upstream (post format-translation), so the directive lands in the
 *     request the target provider receives.
 *   - `gateBody` is what gets INSPECTED for the tool_choice/response_format
 *     gates. It defaults to `body` for direct callers (and tests) that pass
 *     a single already-shaped body, but the real pipeline caller
 *     (`applyStackedCompression` via `StackOptions.cavemanOutputGateBody`)
 *     passes the INBOUND client body instead. Reason: format translation
 *     (e.g. openai -> claude) transforms/consumes exactly these fields
 *     before this function ever runs — `tool_choice: "auto"` (string)
 *     becomes `{type:"auto"}` (object), and `response_format` is consumed
 *     into the system prompt and dropped from the body entirely. Gating on
 *     the translated body made both gates misfire (false negative on the
 *     majority of agentic tool_choice:"auto" traffic; false positive
 *     injecting into structured-output requests, corrupting JSON output).
 *
 * The four inbound request shapes this stage ever sees, and the fallback for
 * a body with no system surface at all, are handled by `appendSystemDirective`
 * — shared with every other directive that injects here.
 */
export function injectCavemanOutputDirective(
  body: Record<string, unknown> | null | undefined,
  level: CavemanOutputLevel,
  gateBody?: Record<string, unknown> | null
): CavemanOutputResult | null {
  if (!body || level === "off") return null;
  const gate = gateBody === undefined ? body : gateBody;
  if (!canInjectSystemDirective(gate)) return null;
  const directive = getCavemanOutputPrompt(level);
  if (!directive) return null;

  const target = appendSystemDirective(body, directive);
  if (!target) return null;

  return { level, target };
}

export function formatCavemanOutputLog(result: CavemanOutputResult | null): string | null {
  if (!result) return null;
  return `[CavemanOutput] level=${result.level} target=${result.target}`;
}
