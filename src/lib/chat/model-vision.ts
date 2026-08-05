/**
 * Can this model actually receive an image?
 *
 * The implementation lives in `open-sse/translator/model-image-support.ts`, because the combo
 * pre-flight partition needs the same answer and runs inside open-sse. This module stays as the
 * dashboard-side name so the UI keeps importing one stable path.
 *
 * @module lib/chat/model-vision
 */

export {
  modelSupportsImages,
  resolveTargetFormat,
} from "@routiform/open-sse/translator/model-image-support.ts";
