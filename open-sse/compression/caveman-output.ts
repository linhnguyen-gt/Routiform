import type { CavemanOutputLevel, CavemanOutputResult, CavemanOutputTarget } from "./types.ts";

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

function appendText(existing: string, addition: string): string {
  return existing.length > 0 ? `${existing}\n\n${addition}` : addition;
}

/**
 * True when `tool_choice` forces the model into a tool call rather than
 * prose (a specific/named tool, or a string like `"required"`). A
 * terseness/prose directive is meaningless (and risks bleeding into
 * generated tool-call arguments) for these.
 *
 * Deliberately an allow-list, not "any object is forced": both the inbound
 * OpenAI shape (`"auto"` / `"none"` / `"required"` / `{type:"function",
 * function:{name}}`) and the Claude-translated shape (`{type:"auto"}` /
 * `{type:"any"}` / `{type:"tool", name}`, see `convertOpenAIToolChoice` in
 * `translator/request/openai-to-claude.ts`) must classify correctly — an
 * "any object = forced" check wrongly treats `{type:"auto"}` as forced,
 * silently killing the directive for the majority of agentic clients
 * (Cline/OpenCode/Cursor/aider/LiteLLM all send `tool_choice: "auto"`,
 * which translation turns into the object `{type:"auto"}`).
 */
function isForcedToolChoice(toolChoice: unknown): boolean {
  if (toolChoice == null) return false;
  if (typeof toolChoice === "string") return toolChoice === "required";
  if (typeof toolChoice !== "object") return false;
  const type = (toolChoice as Record<string, unknown>).type;
  return type === "tool" || type === "function" || type === "any";
}

/**
 * True when the request demands machine-parseable structured output
 * (OpenAI `response_format: {type: "json_schema"|"json_object"}` or the
 * Responses API `text.format: {type: "json_schema"}`). Prose directives like
 * "Fragments OK, drop articles" can corrupt schema-conformant JSON, so these
 * requests must never get the directive.
 */
function requiresStructuredOutput(body: Record<string, unknown> | null | undefined): boolean {
  if (!body) return false;
  const responseFormat = body.response_format;
  if (responseFormat && typeof responseFormat === "object") {
    const type = (responseFormat as Record<string, unknown>).type;
    if (type === "json_schema" || type === "json_object") return true;
  }
  const text = body.text;
  if (text && typeof text === "object") {
    const format = (text as Record<string, unknown>).format;
    if (
      format &&
      typeof format === "object" &&
      (format as Record<string, unknown>).type === "json_schema"
    ) {
      return true;
    }
  }
  return false;
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
 * Handles both request shapes seen at this stage of the pipeline:
 *   - Claude Messages API: `body.system` (string or content-block array)
 *   - OpenAI-style: a `system` / `developer` message in `body.messages`
 * Falls back to prepending a new system message when neither is present.
 */
export function injectCavemanOutputDirective(
  body: Record<string, unknown> | null | undefined,
  level: CavemanOutputLevel,
  gateBody?: Record<string, unknown> | null
): CavemanOutputResult | null {
  if (!body || level === "off") return null;
  const gate = gateBody === undefined ? body : gateBody;
  if (isForcedToolChoice(gate?.tool_choice)) return null;
  if (requiresStructuredOutput(gate)) return null;
  const directive = getCavemanOutputPrompt(level);
  if (!directive) return null;

  let target: CavemanOutputTarget;

  if (typeof body.system === "string") {
    body.system = appendText(body.system, directive);
    target = "system-field";
  } else if (Array.isArray(body.system)) {
    (body.system as unknown[]).push({ type: "text", text: directive });
    target = "system-field";
  } else if (Array.isArray(body.messages)) {
    const messages = body.messages as Array<Record<string, unknown>>;
    const systemMsg = messages.find(
      (m) => m && typeof m === "object" && (m.role === "system" || m.role === "developer")
    );
    if (systemMsg && typeof systemMsg.content === "string") {
      systemMsg.content = appendText(systemMsg.content, directive);
      target = "system-message";
    } else if (systemMsg && Array.isArray(systemMsg.content)) {
      (systemMsg.content as unknown[]).push({ type: "text", text: directive });
      target = "system-message";
    } else if (systemMsg && systemMsg.content == null) {
      // Nothing to preserve — safe to set directly.
      systemMsg.content = directive;
      target = "system-message";
    } else if (systemMsg) {
      // Non-standard content shape (object/number/boolean, not string,
      // array, or null): do not clobber it. Prepend a new system message
      // instead so the existing (unrecognized) content survives untouched.
      messages.unshift({ role: "system", content: directive });
      target = "new-system-message";
    } else {
      messages.unshift({ role: "system", content: directive });
      target = "new-system-message";
    }
  } else {
    return null;
  }

  return { level, target };
}

export function formatCavemanOutputLog(result: CavemanOutputResult | null): string | null {
  if (!result) return null;
  return `[CavemanOutput] level=${result.level} target=${result.target}`;
}
