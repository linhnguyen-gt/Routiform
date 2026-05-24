import { BaseExecutor } from "./base.ts";
import { PROVIDERS } from "../config/constants.ts";
import type { ProviderCredentials } from "./base.ts";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getTextPartContent(part: unknown): string | null {
  const record = asRecord(part);
  if (!record) return null;

  const type = typeof record.type === "string" ? record.type : "";
  if (type !== "text" && type !== "input_text") {
    return null;
  }

  if (typeof record.text === "string") {
    return record.text;
  }

  return typeof record.content === "string" ? record.content : null;
}

function normalizeWorkersAiMessages(body: unknown): unknown {
  const payload = asRecord(body);
  if (!payload) return body;

  const messages = payload.messages;
  if (!Array.isArray(messages)) {
    return body;
  }

  let changed = false;
  const normalizedMessages = messages.map((message) => {
    const messageRecord = asRecord(message);
    if (!messageRecord || !Array.isArray(messageRecord.content)) {
      return message;
    }

    const textParts = messageRecord.content.map(getTextPartContent);
    if (textParts.some((part) => part === null)) {
      return message;
    }

    changed = true;
    return {
      ...messageRecord,
      // Preserve exact part ordering without injecting extra separators.
      content: textParts.join(""),
    };
  });

  return changed
    ? {
        ...payload,
        messages: normalizedMessages,
      }
    : body;
}

/**
 * CloudflareAIExecutor — handles dynamic URL construction with accountId.
 * Cloudflare Workers AI uses the authenticated user's account ID in the URL.
 *
 * URL pattern: https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1/chat/completions
 * Auth: Bearer <API Token>
 * Docs: https://developers.cloudflare.com/workers-ai/
 *
 * Free tier: 10,000 Neurons/day = ~150 LLM responses or 500s Whisper audio
 * API Token: dash.cloudflare.com/profile/api-tokens
 * Account ID: right sidebar of dash.cloudflare.com
 */
export class CloudflareAIExecutor extends BaseExecutor {
  constructor() {
    super("cloudflare-ai", PROVIDERS["cloudflare-ai"] || { format: "openai" });
  }

  buildUrl(
    _model: string,
    _stream: boolean,
    _urlIndex = 0,
    credentials: ProviderCredentials | null = null
  ): string {
    // Account ID can be stored in providerSpecificData or at top level credentials
    const accountId =
      credentials?.providerSpecificData?.accountId ||
      (credentials as { accountId?: string } | null)?.accountId ||
      process.env.CLOUDFLARE_ACCOUNT_ID;

    if (!accountId) {
      throw new Error(
        "Cloudflare Workers AI requires an Account ID. " +
          "Add it in provider settings under 'Account ID'. " +
          "Find it at: https://dash.cloudflare.com (right sidebar)."
      );
    }

    return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;
  }

  buildHeaders(credentials: ProviderCredentials, stream = true): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credentials.apiKey || credentials.accessToken}`,
    };

    if (stream) {
      headers["Accept"] = "text/event-stream";
    }

    return headers;
  }

  transformRequest(
    _model: string,
    body: unknown,
    _stream: boolean,
    _credentials: ProviderCredentials
  ): unknown {
    // Cloudflare uses full model paths like @cf/meta/llama-3.3-70b-instruct.
    // Workers AI is stricter about message content shape, so flatten text-only
    // content-part arrays into plain strings while preserving mixed multimodal payloads.
    return normalizeWorkersAiMessages(body);
  }
}

export default CloudflareAIExecutor;
