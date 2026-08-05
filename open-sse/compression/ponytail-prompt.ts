import { appendSystemDirective } from "./append-system-directive.ts";
import { canInjectSystemDirective } from "./directive-gates.ts";
import type { PonytailOutputMode, PonytailOutputResult } from "./types.ts";

/**
 * Scope restraint: a system-prompt directive that keeps the model from doing more than it was
 * asked to do.
 *
 * A different axis from the caveman output directive, which is about *terseness* — how many words
 * the answer spends. This is about *scope* — how much work the answer proposes. The two are not
 * alternatives and can be on at once: a terse answer can still refactor four files nobody asked
 * about, and a restrained answer can still be verbose.
 *
 * Off by default, like every other directive here. It changes no request content; it appends one
 * block to the system prompt.
 */
export const PONYTAIL_PROMPT = [
  "Scope discipline. Do exactly what was asked — no more.",
  "Shortest working change. Prefer editing an existing file over creating one; prefer one function over a new abstraction. Do not add configuration, options, or extension points nobody requested.",
  "YAGNI. No speculative generality, no 'while I am here' cleanups, no defensive layers for failures that cannot happen in this codebase.",
  "Reuse before adding. Check for an existing helper, module, or pattern first; match it rather than introducing a parallel one.",
  "A problem you notice outside the request is one sentence at the end, not a detour. Say it and move on; the decision to act on it is not yours.",
  "This is about scope, not about care: keep every error path, test, and material caveat the task genuinely needs.",
].join(" ");

/**
 * Inject the scope-restraint directive. Mutates `body` in place; returns `null` when the mode is
 * off, the request forbids prose directives, or the body carries no system surface.
 *
 * `gateBody` overrides what the gates inspect, for callers running on a body whose `tool_choice` or
 * `response_format` has already been reshaped by format translation.
 */
export function injectPonytailDirective(
  body: Record<string, unknown> | null | undefined,
  mode: PonytailOutputMode,
  gateBody?: Record<string, unknown> | null
): PonytailOutputResult | null {
  if (!body || mode !== "on") return null;

  const gate = gateBody === undefined ? body : gateBody;
  if (!canInjectSystemDirective(gate)) return null;

  const target = appendSystemDirective(body, PONYTAIL_PROMPT);
  if (!target) return null;

  return { target };
}

export function formatPonytailLog(result: PonytailOutputResult | null): string | null {
  if (!result) return null;
  return `[Ponytail] target=${result.target}`;
}
