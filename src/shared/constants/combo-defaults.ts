/**
 * Token limits a combo advertises in `/v1/models` when it does not carry its own.
 *
 * A combo routes across several models, so the number it publishes is a promise on behalf
 * of whichever member serves the request. Too high and a client packs a prompt the smallest
 * member rejects; too low and every member is under-used. These are the measured middle.
 *
 * ── How the numbers were picked ────────────────────────────────────────────────
 * Measured across this repo's three model catalogs (`providerRegistry`,
 * `github-copilot-models`, `modelSpecs`), deduplicated by model id, with prior-generation
 * families dropped (gpt-4.x, glm-4.x, claude-*-4.5, gemini-2.x) — 41 current-generation
 * models:
 *
 *   context     min 200,000 · p25 264,000 · median 400,000 · p75 1,000,000 · max 1,050,000
 *   max output  min  32,000 · p25  64,000 · median 128,000 · p75   128,000 · max   131,072
 *
 * No current-generation model sits below 200,000 context; the dense clusters are 264,000
 * (claude-sonnet-5 / opus-5 / fable-5 / gemini-3.6-flash) and 400,000 (the gpt-5.x family).
 *
 * Re-measure before changing these. The distribution moves with every model generation, and
 * a number carried forward on habit is worse than one that was never researched.
 */

/**
 * 300,000 — between the 264,000 cluster and the 400,000 gpt-5.x cluster.
 *
 * Deliberately above the p25: it over-advertises for the 15 current-gen models that sit
 * below it (by at most 100,000 tokens for a 200,000-context member), and under-advertises
 * for the 26 above. Combos that set their own `context_length` are never touched.
 */
export const DEFAULT_COMBO_CONTEXT_LENGTH = 300_000;

/**
 * 64,000 — the p25 of current-gen output limits, and the exact limit of the whole
 * claude-5 / gemini-3.x band. Below the 128,000 the gpt-5.x family allows, above the
 * 32,000 floor that only prior-generation models still impose.
 */
export const DEFAULT_COMBO_MAX_OUTPUT_TOKENS = 64_000;

/**
 * Accepted range for a hand-set limit.
 *
 * The API schema and the dashboard form both read these. Duplicating the numbers is how the
 * form ends up accepting a value the API then rejects, so there is one source for both.
 * The ceilings sit above every model measured above, deliberately: a limit the user typed
 * on purpose is their call, and the range exists to catch typos, not to second-guess them.
 */
export const COMBO_CONTEXT_LENGTH_BOUNDS = { min: 1_000, max: 2_000_000 } as const;
export const COMBO_MAX_OUTPUT_TOKENS_BOUNDS = { min: 256, max: 200_000 } as const;
