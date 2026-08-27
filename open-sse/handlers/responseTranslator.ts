import { FORMATS } from "../translator/formats.ts";
import { convertOpenAINonStreamingToClaude } from "./responseTranslator/openaiToClaude.ts";
import { translateResponsesToOpenAI } from "./responseTranslator/fromResponses.ts";
import { translateGeminiToOpenAI } from "./responseTranslator/fromGemini.ts";
import { translateDevinToOpenAI } from "./responseTranslator/fromDevin.ts";
import { translateClaudeToOpenAI } from "./responseTranslator/fromClaude.ts";
import { toRecord } from "./responseTranslator/shared.ts";

/**
 * Translate non-streaming response to OpenAI format
 * Handles different provider response formats (Gemini, Claude, etc.)
 *
 * @param toolNameMap - Optional Map<prefixedName, originalName> for Claude OAuth tool name stripping
 */
export function translateNonStreamingResponse(
  responseBody: unknown,
  targetFormat: string,
  sourceFormat: string,
  toolNameMap?: Map<string, string> | null
): unknown {
  // If already in source format, return as-is
  if (targetFormat === sourceFormat) {
    return responseBody;
  }

  let intermediateOpenAI = responseBody;

  if (targetFormat === FORMATS.OPENAI_RESPONSES) {
    intermediateOpenAI = translateResponsesToOpenAI(responseBody, toolNameMap);
  } else if (targetFormat === FORMATS.GEMINI || targetFormat === FORMATS.ANTIGRAVITY) {
    intermediateOpenAI = translateGeminiToOpenAI(responseBody) ?? intermediateOpenAI;
  } else if (targetFormat === FORMATS.DEVIN) {
    intermediateOpenAI = translateDevinToOpenAI(responseBody);
  } else if (targetFormat === FORMATS.CLAUDE) {
    intermediateOpenAI = translateClaudeToOpenAI(responseBody, toolNameMap) ?? intermediateOpenAI;
  }

  // Phase 3: Translate from OpenAI back to Client Source format
  if (sourceFormat === FORMATS.CLAUDE && sourceFormat !== targetFormat) {
    return convertOpenAINonStreamingToClaude(toRecord(intermediateOpenAI));
  }

  // Return intermediateOpenAI (which is either the raw response if unknown targetFormat, or an OpenAI compatible payload)
  return intermediateOpenAI;
}

export { applyForcedToolChoiceFallback } from "./responseTranslator/forcedToolChoiceFallback.ts";
