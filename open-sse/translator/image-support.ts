/**
 * Which target formats can actually carry an image to the provider.
 *
 * This is not a capability the model catalog advertises — it is a property of the
 * request translator that runs on the way out. A vision-capable model reached
 * through a translator that drops images will answer confidently about an image
 * it never received, and nothing in the response says so.
 *
 * Measured against the translators on 2026-07-13. Each entry cites the code that
 * decides it, so a future change to a translator has an obvious place to update.
 * tests/unit/translator-image-support.test.mjs asserts these claims against the
 * real translators — if one starts or stops carrying images, that test fails.
 *
 * @module translator/image-support
 */

import { FORMATS } from "./formats.ts";

export type ImageSupport =
  | "carries" // image parts reach the provider intact
  | "drops"; // image parts are discarded or replaced with a text placeholder

/**
 * Target format → whether an OpenAI-shaped `image_url` part survives translation.
 *
 * - openai:           native passthrough.
 * - claude:           openai-to-claude.ts:512-525 — base64 data URLs AND remote https URLs.
 * - gemini:           helpers/geminiHelper.ts:77-100 — data: URLs become inlineData.
 *                     NOTE: a remote https:// image URL is still dropped (the branch is
 *                     gated on `.startsWith("data:")`). Gemini has no equivalent of Claude's
 *                     url source: fileData.fileUri requires a Files-API or gs:// URI, not an
 *                     arbitrary URL, so carrying one means fetching and inlining it — an
 *                     SSRF surface, deliberately not taken. Attachments are stored as blobs
 *                     and rehydrated as data: URLs, so this path is not used by the chat.
 * - kiro:             openai-to-kiro.ts:248 — image_url with a data URI → userInputMessage.images.
 *                     Only base64; a remote https URL degrades to the text "[Image: <url>]" (:258).
 *                     NOTE: until 2026-07-13 the current turn's images were parsed and then dropped
 *                     when the payload rebuilt userInputMessage field-by-field, so an attached image
 *                     only reached the model one turn late. Fixed; pinned by the regression test.
 * - openai-responses: openai-responses.ts:123-129 — input_image ⇄ image_url.
 *
 * - cursor:           openai-to-cursor.ts — its own extractContent() returns text only.
 *                     There is no image branch anywhere in the file.
 * - devin:            openai-to-devin.ts:51 — pushes the literal string "[image omitted]".
 * - commandcode:      openai-to-commandcode.ts:86 — same, as a text block.
 *
 * devin and commandcode are arguably worse than cursor: they tell the model an image
 * was present and then withhold it.
 */
const FORMAT_IMAGE_SUPPORT: Record<string, ImageSupport> = {
  [FORMATS.OPENAI]: "carries",
  [FORMATS.OPENAI_RESPONSES]: "carries",
  [FORMATS.CLAUDE]: "carries",
  [FORMATS.GEMINI]: "carries",
  // Both reach convertOpenAIContentToParts via openaiToGeminiBase
  // (openai-to-gemini.ts:360 and :712); antigravity's Claude branch goes through
  // openaiToClaudeRequestForAntigravity, which carries images too.
  [FORMATS.GEMINI_CLI]: "carries",
  [FORMATS.ANTIGRAVITY]: "carries",
  [FORMATS.KIRO]: "carries",

  // Not a FORMATS constant. getTargetFormat can return a bare `format` string straight from
  // the provider registry, and kilocode's is "openrouter" — a format with no registered
  // translator at all, so the OpenAI body passes through untouched and images survive.
  // Enumerating FORMATS is therefore NOT sufficient to cover this map; the test enumerates
  // what the 60 real providers actually resolve to.
  openrouter: "carries",

  [FORMATS.CURSOR]: "drops",
  [FORMATS.DEVIN]: "drops",
  [FORMATS.COMMANDCODE]: "drops",
};

// FORMATS also declares CODEX and OPENAI_RESPONSE. Neither is ever register()ed
// as a translation target, so neither can be a targetFormat and neither belongs here.

/**
 * Can this target format carry an image?
 *
 * Unknown formats are treated as "drops". A new translator has to opt in
 * deliberately, because the failure mode of guessing wrong is silent: the user
 * attaches a screenshot and the model answers about nothing.
 */
export function formatCarriesImages(format: string | null | undefined): boolean {
  if (!format) return false;
  return FORMAT_IMAGE_SUPPORT[format] === "carries";
}

/** The full matrix, for tests and for surfacing to the UI. */
export function getImageSupportMatrix(): Record<string, ImageSupport> {
  return { ...FORMAT_IMAGE_SUPPORT };
}
