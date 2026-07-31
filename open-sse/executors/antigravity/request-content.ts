/**
 * Content-level fixups applied to the Gemini `request` before it reaches the
 * Antigravity upstream: role normalization, thought stripping, tool-schema
 * sanitation and client-name obfuscation.
 *
 * @module executors/antigravity/request-content
 */
import { obfuscateSensitiveWords } from "../../services/antigravityObfuscation.ts";
import { cleanJSONSchemaForAntigravity } from "../../translator/helpers/geminiHelper.ts";
import type { AntigravityContent } from "./types.ts";

/**
 * Fix contents for Claude models via Antigravity.
 *
 * Antigravity rejects synthetic thought text, but Gemini 3+ requires returned
 * thoughtSignature metadata to survive model tool-call turns.
 * Messages left with zero parts are dropped.
 */
export function normalizeContents(
  contents: AntigravityContent[] | undefined
): AntigravityContent[] {
  const normalized =
    contents?.map((c) => {
      let role = c.role;
      // functionResponse must be role "user" for Claude models
      if (c.parts?.some((p) => p.functionResponse)) {
        role = "user";
      }

      const hasFunctionCall = c.parts?.some((p) => p.functionCall) || false;
      const parts =
        c.parts?.filter((p) => !p.thought && (hasFunctionCall || !p.thoughtSignature)) || [];
      return { ...c, role, parts };
    }) || [];

  return normalized.filter((c) => (Array.isArray(c.parts) ? c.parts.length > 0 : true));
}

/**
 * Defense-in-depth: sanitize tool parameter schemas before sending upstream.
 * Some clients (opencode, certain Cursor builds) pass raw Zod schemas as
 * `tool.parameters`, which carry internal markers like `_def`, `~standard`,
 * `_zod` that Antigravity rejects with 400 "Unknown name". Translators already
 * run `cleanJSONSchemaForAntigravity` for known formats, but running it again
 * here costs one cheap pass and guards against new ingestion paths that bypass
 * the translator.
 */
export function sanitizeToolSchemas(tools: unknown): void {
  if (!Array.isArray(tools)) return;
  for (const group of tools) {
    const decls = (group as { functionDeclarations?: unknown[] })?.functionDeclarations;
    if (!Array.isArray(decls)) continue;
    for (const decl of decls) {
      const fn = decl as { parameters?: unknown };
      if (fn?.parameters && typeof fn.parameters === "object") {
        fn.parameters = cleanJSONSchemaForAntigravity(fn.parameters);
      }
    }
  }
}

/** Obfuscate sensitive client names in user content (e.g. "OpenCode", "Cursor"). */
export function obfuscateContents(contents: AntigravityContent[] | undefined): void {
  if (!Array.isArray(contents)) return;
  for (const msg of contents) {
    if (Array.isArray(msg.parts)) {
      for (const part of msg.parts) {
        if (typeof part.text === "string") {
          part.text = obfuscateSensitiveWords(part.text);
        }
      }
    }
  }
}
