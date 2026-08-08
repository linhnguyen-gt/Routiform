import {
  isAccountDeactivated,
  isCreditsExhausted,
  isOAuthInvalidToken,
} from "./accountFallback.ts";
import { unwrapOpenAIChatCompletionRoot } from "../utils/chatCompletionEnvelope.ts";
import { hasRenderableAssistantText } from "../utils/assistantContent.ts";

/** o1 / Kimi / OpenCode may put text in reasoning fields with empty `content` (e.g. low max_tokens). */
function hasAssistantReasoningSignal(
  message: Record<string, unknown> | undefined,
  delta: Record<string, unknown> | undefined
): boolean {
  const keys = ["reasoning", "reasoning_content", "thinking"] as const;
  for (const k of keys) {
    for (const slot of [message, delta]) {
      if (!slot) continue;
      const v = slot[k];
      if (typeof v === "string" && v.trim().length > 0) return true;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const o = v as Record<string, unknown>;
        if (typeof o.text === "string" && o.text.trim()) return true;
        if (typeof o.content === "string" && o.content.trim()) return true;
      }
    }
  }
  return false;
}

/** True when assistant message has extractable user-visible text (string, parts[], or object text/content). */
function hasRenderableAssistantContent(content: unknown): boolean {
  if (content === null || content === undefined) return false;
  if (typeof content === "string") return hasRenderableAssistantText(content);
  if (Array.isArray(content)) {
    for (const part of content) {
      if (typeof part === "string" && hasRenderableAssistantText(part)) return true;
      if (part && typeof part === "object" && !Array.isArray(part)) {
        const o = part as Record<string, unknown>;
        const t =
          (typeof o.text === "string" && hasRenderableAssistantText(o.text)) ||
          (typeof o.content === "string" && hasRenderableAssistantText(o.content));
        if (t) return true;
      }
    }
    return false;
  }
  if (typeof content === "object") {
    const o = content as Record<string, unknown>;
    return Boolean(
      (typeof o.text === "string" && hasRenderableAssistantText(o.text)) ||
      (typeof o.content === "string" && hasRenderableAssistantText(o.content))
    );
  }
  return false;
}

/**
 * Whether a Responses-API `output` array amounts to the provider having said nothing.
 *
 * Deliberately mirrors the reasoning-model carve-out the `choices` branch below applies:
 * output tokens mean the model did work, and a model that reasons and then declines to
 * speak is a legitimate answer rather than a failed request. Only a response that produced
 * no items and no tokens is treated as empty, so this can never retry a reasoning-only
 * reply that the rest of this function would have let through.
 */
function isEmptyResponsesOutput(output: unknown[], usage: unknown): boolean {
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : "";

    if (type === "function_call" || type === "custom_tool_call") return false;
    if (type === "reasoning") {
      const summary = Array.isArray(record.summary) ? record.summary : [];
      if (summary.length > 0) return false;
      continue;
    }
    if (type !== "message") continue;

    const parts = Array.isArray(record.content) ? record.content : [];
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const partRecord = part as Record<string, unknown>;
      if (typeof partRecord.text === "string" && hasRenderableAssistantText(partRecord.text)) {
        return false;
      }
    }
  }

  const usageRecord = usage && typeof usage === "object" ? (usage as Record<string, unknown>) : {};
  const outputTokens =
    typeof usageRecord.output_tokens === "number" ? usageRecord.output_tokens : 0;
  return outputTokens === 0;
}

export function isEmptyContentResponse(responseBody: unknown): boolean {
  if (!responseBody || typeof responseBody !== "object") return false;

  let body = responseBody as Record<string, unknown>;
  body = unwrapOpenAIChatCompletionRoot(body);

  if (Array.isArray(body.choices)) {
    const firstChoice = body.choices[0] as Record<string, unknown> | undefined;
    if (!firstChoice) return true;

    const message = firstChoice.message as Record<string, unknown> | undefined;
    const delta = firstChoice.delta as Record<string, unknown> | undefined;

    const content = message?.content ?? delta?.content;
    const refusal =
      typeof message?.refusal === "string"
        ? message.refusal
        : typeof delta?.refusal === "string"
          ? delta.refusal
          : "";
    if (refusal.trim()) return false;

    const hasToolCalls =
      (Array.isArray(message?.tool_calls) && (message.tool_calls as unknown[]).length > 0) ||
      (Array.isArray(delta?.tool_calls) && (delta.tool_calls as unknown[]).length > 0);

    const hasContent = hasRenderableAssistantContent(content);
    const hasReasoning = hasAssistantReasoningSignal(message, delta);
    const isPlaceholderOnlyStringContent =
      typeof content === "string" &&
      content.trim().length > 0 &&
      !hasRenderableAssistantText(content);

    const usage = body.usage as Record<string, unknown> | undefined;
    const completionTok =
      typeof usage?.completion_tokens === "number" ? usage.completion_tokens : 0;
    const details = usage?.completion_tokens_details as Record<string, unknown> | undefined;
    const reasoningTok =
      typeof details?.reasoning_tokens === "number" ? details.reasoning_tokens : 0;
    if (completionTok > 0 || reasoningTok > 0) {
      if (isPlaceholderOnlyStringContent && !hasToolCalls && !hasReasoning) return true;
      return false;
    }

    return !hasContent && !hasToolCalls && !hasReasoning;
  }

  // Responses-API shape (`{ object: "response", output: [...] }`), which the codex and
  // openai-responses targets produce. Without this the whole shape fell through to the
  // `return false` below, so a provider that answered with nothing at all was reported to
  // the client as a successful empty completion instead of triggering the retry path.
  if (body.object === "response" && Array.isArray(body.output)) {
    return isEmptyResponsesOutput(body.output, body.usage);
  }

  if (Array.isArray(body.content)) {
    return body.content.length === 0;
  }

  if (typeof body.text === "string") {
    return body.text.trim() === "";
  }

  if ("content" in body) {
    const content = body.content;
    if (content === null || content === undefined) return true;
    if (typeof content === "string") return !hasRenderableAssistantText(content);
    return content === "";
  }

  return false;
}

export const PROVIDER_ERROR_TYPES = {
  RATE_LIMITED: "rate_limited",
  UNAUTHORIZED: "unauthorized",
  ACCOUNT_DEACTIVATED: "account_deactivated",
  FORBIDDEN: "forbidden",
  SERVER_ERROR: "server_error",
  QUOTA_EXHAUSTED: "quota_exhausted",
  PROJECT_ROUTE_ERROR: "project_route_error",
  CONTEXT_OVERFLOW: "context_overflow",
  OAUTH_INVALID_TOKEN: "oauth_invalid_token",
  EMPTY_CONTENT: "empty_content",
};

export const CONTEXT_OVERFLOW_SIGNALS = [
  "context overflow",
  "prompt too large",
  "context window",
  "maximum context",
  "exceeds context",
  "input too long",
  "token limit",
  "too many tokens",
  "context length",
  "exceed.*context",
  "messages exceed",
];

export const CONTEXT_OVERFLOW_REGEX = new RegExp(CONTEXT_OVERFLOW_SIGNALS.join("|"), "i");

export function isContextOverflow(errorText: string): boolean {
  return CONTEXT_OVERFLOW_REGEX.test(String(errorText || ""));
}

function responseBodyToString(responseBody: unknown): string {
  if (typeof responseBody === "string") return responseBody;
  if (responseBody !== null && typeof responseBody === "object") {
    try {
      return JSON.stringify(responseBody);
    } catch {
      return "";
    }
  }
  return "";
}

export function classifyProviderError(statusCode: number, responseBody: unknown): string | null {
  const bodyStr = responseBodyToString(responseBody);
  const creditsExhausted = isCreditsExhausted(bodyStr);
  const accountDeactivated = isAccountDeactivated(bodyStr);
  const oauthInvalid = isOAuthInvalidToken(bodyStr);

  if (
    creditsExhausted &&
    (statusCode === 400 || statusCode === 402 || statusCode === 429 || statusCode === 403)
  ) {
    return PROVIDER_ERROR_TYPES.QUOTA_EXHAUSTED;
  }

  if (statusCode === 429) {
    return PROVIDER_ERROR_TYPES.RATE_LIMITED;
  }

  if (statusCode === 401) {
    if (oauthInvalid) {
      return PROVIDER_ERROR_TYPES.OAUTH_INVALID_TOKEN;
    }
    return accountDeactivated
      ? PROVIDER_ERROR_TYPES.ACCOUNT_DEACTIVATED
      : PROVIDER_ERROR_TYPES.UNAUTHORIZED;
  }

  if (statusCode === 402) return PROVIDER_ERROR_TYPES.QUOTA_EXHAUSTED;
  if (statusCode === 403 && accountDeactivated) {
    return PROVIDER_ERROR_TYPES.ACCOUNT_DEACTIVATED;
  }
  if (statusCode === 403) {
    // Subscription/capacity errors are temporary, not permanent bans
    const lowerBody = bodyStr.toLowerCase();
    if (
      lowerBody.includes("subscription is required") ||
      lowerBody.includes("requires a subscription") ||
      lowerBody.includes("upgrade for access") ||
      lowerBody.includes("high volume") ||
      lowerBody.includes("capacity is being added")
    ) {
      return PROVIDER_ERROR_TYPES.RATE_LIMITED;
    }
    if (bodyStr.includes("has not been used in project")) {
      return PROVIDER_ERROR_TYPES.PROJECT_ROUTE_ERROR;
    }
    return PROVIDER_ERROR_TYPES.FORBIDDEN;
  }
  if (statusCode >= 500) return PROVIDER_ERROR_TYPES.SERVER_ERROR;

  if (statusCode === 400 && isContextOverflow(bodyStr)) {
    return PROVIDER_ERROR_TYPES.CONTEXT_OVERFLOW;
  }

  return null;
}
