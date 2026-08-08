/**
 * The two token-limit inputs on the combo form, as pure functions.
 *
 * Kept out of the component so the rules can be tested — the dashboard has no React test
 * harness, and these rules are exactly the part worth pinning: one of them decides whether
 * a combo keeps tracking the default or freezes at today's number.
 */

import {
  COMBO_CONTEXT_LENGTH_BOUNDS,
  COMBO_MAX_OUTPUT_TOKENS_BOUNDS,
  DEFAULT_COMBO_CONTEXT_LENGTH,
  DEFAULT_COMBO_MAX_OUTPUT_TOKENS,
} from "@/shared/constants/combo-defaults";

export interface TokenLimitField {
  /** Value used when the combo carries none. Shown as the input's placeholder. */
  readonly fallback: number;
  readonly min: number;
  readonly max: number;
}

export const COMBO_CONTEXT_LENGTH_FIELD: TokenLimitField = {
  fallback: DEFAULT_COMBO_CONTEXT_LENGTH,
  ...COMBO_CONTEXT_LENGTH_BOUNDS,
};

export const COMBO_MAX_OUTPUT_TOKENS_FIELD: TokenLimitField = {
  fallback: DEFAULT_COMBO_MAX_OUTPUT_TOKENS,
  ...COMBO_MAX_OUTPUT_TOKENS_BOUNDS,
};

/**
 * What the input shows when the form opens.
 *
 * The API normalizes missing limits to the default before the dashboard ever sees them, so
 * a combo that chose nothing and one that chose exactly the default are indistinguishable
 * here. Both render empty, which is the useful reading of the ambiguity: an untouched combo
 * keeps following the default instead of silently freezing at today's number the first time
 * someone edits its name.
 */
export function toTokenLimitInput(stored: unknown, field: TokenLimitField): string {
  if (typeof stored !== "number" || !Number.isFinite(stored) || stored <= 0) return "";
  if (stored === field.fallback) return "";
  return String(stored);
}

export type TokenLimitParse = { ok: true; value: number | null } | { ok: false; error: string };

/**
 * What an edited input means.
 *
 * An empty box resolves to `null` rather than to "leave it alone": the update endpoint
 * merges its body into the stored combo, so omitting the field would keep the old value and
 * make the field impossible to clear from the UI.
 */
export function parseTokenLimitInput(raw: string, field: TokenLimitField): TokenLimitParse {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };

  // Number() accepts "1e6", " 12 " and "0x10"; the form must not let through anything the
  // API schema would then reject, so only plain digits count.
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: "Enter a whole number of tokens" };
  }

  const value = Number(trimmed);
  if (value < field.min || value > field.max) {
    return {
      ok: false,
      error: `Must be between ${field.min.toLocaleString("en-US")} and ${field.max.toLocaleString("en-US")}`,
    };
  }

  return { ok: true, value };
}
