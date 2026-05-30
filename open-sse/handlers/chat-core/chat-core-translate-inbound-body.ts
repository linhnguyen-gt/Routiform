import { getModelNormalizeToolCallId, getModelPreserveOpenAIDeveloperRole } from "@/lib/localDb";
import { FORMATS } from "../../translator/formats.ts";
import { sanitizeAnthropicThinkingPayload } from "../../translator/helpers/claudeHelper.ts";
import { translateRequest } from "../../translator/index.ts";
import {
  buildClaudeCodeCompatibleRequest,
  resolveClaudeCodeCompatibleSessionId,
} from "../../services/claudeCodeCompatible.ts";
import {
  disableThinkingIfToolChoiceForced,
  enforceThinkingTemperature,
} from "../../services/claudeCodeConstraints.ts";
import { remapToolNamesInRequest } from "../../services/claudeCodeToolRemapper.ts";
import type {
  HandlerLogger,
  JsonRecord,
  ProviderCredentials,
  RawRequestLike,
} from "../types/chat-core.ts";
import type { RequestLogger } from "../types/chat-core.ts";
import { shouldBridgeGithubClaudeOpenAiThroughClaudeFormat } from "./chat-core-flags.ts";
import { normalizeOpenAiStyleMessagesForTranslation } from "./chat-core-normalize-openai-messages.ts";
import { failureFromTranslateError } from "./chat-core-translate-error.ts";

export type TranslateInboundBodyFailure = Awaited<ReturnType<typeof failureFromTranslateError>>;

export type TranslateInboundBodyResult =
  | { ok: true; translatedBody: JsonRecord; ccSessionId: string | null }
  | { ok: false; failure: TranslateInboundBodyFailure };

export async function translateInboundRequestBody({
  nativeCodexPassthrough,
  isClaudeCodeCompatible,
  isClaudePassthrough,
  body,
  provider,
  model,
  sourceFormat,
  targetFormat,
  stream,
  credentials,
  reqLogger,
  preserveCacheControl,
  log,
  clientRawRequest,
  resolvedModel,
  upstreamStream,
}: {
  nativeCodexPassthrough: boolean;
  isClaudeCodeCompatible: boolean;
  isClaudePassthrough: boolean;
  body: JsonRecord;
  provider: string;
  model: string;
  sourceFormat: string;
  targetFormat: string;
  stream: boolean;
  credentials: ProviderCredentials;
  reqLogger: RequestLogger;
  preserveCacheControl: boolean;
  log: HandlerLogger | null | undefined;
  clientRawRequest?: RawRequestLike | null;
  resolvedModel: string;
  upstreamStream: boolean;
}): Promise<TranslateInboundBodyResult> {
  let translatedBody: JsonRecord;
  let ccSessionId: string | null = null;

  try {
    if (nativeCodexPassthrough) {
      translatedBody = { ...body, _nativeCodexPassthrough: true };
      log?.debug?.("FORMAT", "native codex passthrough enabled");
    } else if (
      sourceFormat === FORMATS.OPENAI_RESPONSES &&
      targetFormat === FORMATS.OPENAI_RESPONSES
    ) {
      translatedBody = { ...body };
      log?.debug?.("FORMAT", "native responses passthrough enabled");
    } else if (isClaudeCodeCompatible) {
      let normalizedForCc = { ...body };

      if (sourceFormat !== FORMATS.OPENAI) {
        const normalizeToolCallId = getModelNormalizeToolCallId(
          provider || "",
          model || "",
          sourceFormat
        );
        const preserveDeveloperRole = getModelPreserveOpenAIDeveloperRole(
          provider || "",
          model || "",
          sourceFormat
        );
        normalizedForCc = translateRequest(
          sourceFormat,
          FORMATS.OPENAI,
          model,
          { ...body },
          stream,
          credentials,
          provider,
          reqLogger,
          { normalizeToolCallId, preserveDeveloperRole, preserveCacheControl }
        );
      }

      ccSessionId = resolveClaudeCodeCompatibleSessionId(clientRawRequest?.headers);
      translatedBody = buildClaudeCodeCompatibleRequest({
        sourceBody: body,
        normalizedBody: normalizedForCc,
        claudeBody: sourceFormat === FORMATS.CLAUDE ? body : null,
        model,
        stream: upstreamStream,
        sessionId: ccSessionId,
        cwd: process.cwd(),
        now: new Date(),
        preserveCacheControl,
      });

      remapToolNamesInRequest(translatedBody);
      enforceThinkingTemperature(translatedBody);
      disableThinkingIfToolChoiceForced(translatedBody);

      log?.debug?.("FORMAT", "claude-code-compatible bridge enabled");
    } else if (isClaudePassthrough) {
      translatedBody = { ...body };
      translatedBody._disableToolPrefix = true;
      sanitizeAnthropicThinkingPayload(translatedBody);
      log?.debug?.("FORMAT", `claude passthrough (preserveCache=${preserveCacheControl})`);
    } else {
      translatedBody = { ...body };

      if (targetFormat === FORMATS.CLAUDE) {
        translatedBody._disableToolPrefix = true;
      }

      normalizeOpenAiStyleMessagesForTranslation(translatedBody, targetFormat, log);

      const normalizeToolCallId = getModelNormalizeToolCallId(
        provider || "",
        model || "",
        sourceFormat
      );
      const preserveDeveloperRole = getModelPreserveOpenAIDeveloperRole(
        provider || "",
        model || "",
        sourceFormat
      );
      const translateOpts = {
        normalizeToolCallId,
        preserveDeveloperRole,
        preserveCacheControl,
      };

      if (
        shouldBridgeGithubClaudeOpenAiThroughClaudeFormat(
          provider || "",
          sourceFormat,
          targetFormat,
          String(resolvedModel || "")
        )
      ) {
        const anthropicShaped = translateRequest(
          FORMATS.OPENAI,
          FORMATS.CLAUDE,
          model,
          translatedBody,
          stream,
          credentials,
          provider,
          reqLogger,
          translateOpts
        );
        translatedBody = translateRequest(
          FORMATS.CLAUDE,
          FORMATS.OPENAI,
          model,
          anthropicShaped,
          stream,
          credentials,
          provider,
          reqLogger,
          translateOpts
        );
        log?.debug?.(
          "FORMAT",
          "github Claude: OpenAI→Claude→OpenAI bridge (parity with /v1/messages clients)"
        );
      } else {
        translatedBody = translateRequest(
          sourceFormat,
          targetFormat,
          model,
          translatedBody,
          stream,
          credentials,
          provider,
          reqLogger,
          translateOpts
        );
      }
    }
  } catch (error: unknown) {
    return { ok: false, failure: failureFromTranslateError(error, log) };
  }

  return { ok: true, translatedBody, ccSessionId };
}
