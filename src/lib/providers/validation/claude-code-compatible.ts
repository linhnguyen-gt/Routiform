import {
  buildClaudeCodeCompatibleHeaders,
  buildClaudeCodeCompatibleValidationPayload,
  CLAUDE_CODE_COMPATIBLE_DEFAULT_CHAT_PATH,
  CLAUDE_CODE_COMPATIBLE_DEFAULT_MODELS_PATH,
  joinClaudeCodeCompatibleUrl,
} from "@routiform/open-sse/services/claudeCodeCompatible.ts";
import { isOutboundUrlPolicyError, safeOutboundFetch } from "@/lib/network/safeOutboundFetch";
import { applyCustomUserAgent, toValidationErrorMessage } from "./http-utils";
import { normalizeClaudeCodeCompatibleBaseUrl } from "./url-utils";

export async function validateClaudeCodeCompatibleProvider({
  apiKey,
  providerSpecificData = {},
}: {
  apiKey: string;
  providerSpecificData?: Record<string, unknown>;
}) {
  const baseUrl =
    typeof providerSpecificData.baseUrl === "string"
      ? normalizeClaudeCodeCompatibleBaseUrl(providerSpecificData.baseUrl)
      : "";
  if (!baseUrl) {
    return { valid: false, error: "No base URL configured for CC Compatible provider" };
  }

  const modelsPath =
    typeof providerSpecificData?.modelsPath === "string"
      ? providerSpecificData.modelsPath
      : CLAUDE_CODE_COMPATIBLE_DEFAULT_MODELS_PATH;
  const chatPath =
    typeof providerSpecificData?.chatPath === "string"
      ? providerSpecificData.chatPath
      : CLAUDE_CODE_COMPATIBLE_DEFAULT_CHAT_PATH;
  const defaultHeaders = applyCustomUserAgent(
    buildClaudeCodeCompatibleHeaders(apiKey, false),
    providerSpecificData
  );

  try {
    const modelsRes = await safeOutboundFetch(
      joinClaudeCodeCompatibleUrl(baseUrl, modelsPath),
      {
        method: "GET",
        headers: defaultHeaders,
      },
      { timeoutMs: 10_000 }
    );

    if (modelsRes.ok) {
      return { valid: true, error: null, method: "models_endpoint" };
    }

    if (modelsRes.status === 401 || modelsRes.status === 403) {
      return { valid: false, error: "Invalid API key" };
    }
  } catch (error: unknown) {
    if (isOutboundUrlPolicyError(error)) {
      return {
        valid: false,
        error: toValidationErrorMessage(error, "Validation failed"),
      };
    }
    // Fall through to bridge request validation.
  }

  const payload = buildClaudeCodeCompatibleValidationPayload(
    typeof providerSpecificData?.validationModelId === "string"
      ? providerSpecificData.validationModelId
      : "claude-sonnet-4-20250514"
  );
  const sessionId = JSON.parse(payload.metadata.user_id).session_id;

  try {
    const messagesRes = await safeOutboundFetch(
      joinClaudeCodeCompatibleUrl(baseUrl, chatPath),
      {
        method: "POST",
        headers: applyCustomUserAgent(
          buildClaudeCodeCompatibleHeaders(apiKey, true, sessionId),
          providerSpecificData
        ),
        body: JSON.stringify(payload),
      },
      { timeoutMs: 15_000 }
    );

    if (messagesRes.status === 401 || messagesRes.status === 403) {
      return { valid: false, error: "Invalid API key" };
    }

    if (messagesRes.status === 429) {
      return {
        valid: true,
        error: null,
        method: "cc_bridge_request",
        warning: "Rate limited, but credentials are valid",
      };
    }

    if (messagesRes.status >= 400 && messagesRes.status < 500) {
      return {
        valid: true,
        error: null,
        method: "cc_bridge_request",
        warning: "Bridge request reached upstream, but the model or payload was rejected",
      };
    }

    return {
      valid: messagesRes.ok,
      error: messagesRes.ok ? null : `Validation failed: ${messagesRes.status}`,
      method: "cc_bridge_request",
    };
  } catch (error: unknown) {
    return { valid: false, error: toValidationErrorMessage(error, "Connection failed") };
  }
}
