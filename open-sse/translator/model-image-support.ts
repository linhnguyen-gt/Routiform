/**
 * Can this model, reached through this provider, actually receive an image?
 *
 * Vision is not a property of the model alone. A vision-capable model reached through a translator
 * that discards image parts will answer confidently about an image it never got, and nothing in
 * the response says so. So the question is really about the TARGET FORMAT the request will be
 * translated into — which is what `./image-support.ts` answers.
 *
 * Lives in open-sse rather than in `src/lib/` because both the dashboard model list and the combo
 * pre-flight need it, and the pre-flight runs inside open-sse. One implementation: if the UI's
 * answer and the router's answer ever diverged, attachments would be enabled on a path that drops
 * them.
 *
 * @module translator/model-image-support
 */

import { getModelTargetFormat } from "../config/providerModels.ts";
import { getTargetFormat } from "../services/provider.ts";
import { formatCarriesImages } from "./image-support.ts";

/**
 * Resolve the target format for a model exactly as the chat request path does.
 *
 * The resolution deliberately mirrors `src/sse/handlers/chat.ts:711` — a per-model targetFormat
 * override wins, otherwise the provider default.
 *
 * `provider` may be a provider id or its alias — getTargetFormat and getModelTargetFormat both
 * accept either (verified across all 60 registered providers; they agree on every one).
 */
export function resolveTargetFormat(provider: string, model: string): string {
  // No provider means no route, so there is no format to speak of. Do NOT default to "openai"
  // here: that would report vision support for a model that cannot be reached at all.
  if (!provider) return "";
  return getModelTargetFormat(provider, model) || getTargetFormat(provider);
}

/**
 * True when an image attached to this model reaches the provider intact.
 *
 * Unknown formats resolve to false: a new translator must opt in, because guessing wrong here
 * is silent — the user attaches a screenshot and the model answers about nothing.
 */
export function modelSupportsImages(provider: string, model: string): boolean {
  return formatCarriesImages(resolveTargetFormat(provider, model));
}
