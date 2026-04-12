import { BaseExecutor, ExecuteInput } from "./base.ts";
import { PROVIDERS, OAUTH_ENDPOINTS } from "../config/constants.ts";
import { getModelTargetFormat } from "../config/providerModels.ts";

type JsonObject = Record<string, unknown>;

type ResponseFormat = {
  type?: "json_object" | "json_schema" | string;
  json_schema?: { schema?: unknown };
};

type ChatMessagePart = {
  type?: string;
  text?: string;
  content?: unknown;
  [key: string]: unknown;
};

type ChatMessage = {
  role?: string;
  content?: string | ChatMessagePart[] | null;
  [key: string]: unknown;
};

export class GithubExecutor extends BaseExecutor {
  constructor() {
    super("github", PROVIDERS.github);
  }

  getCopilotToken(credentials) {
    return credentials?.copilotToken || credentials?.providerSpecificData?.copilotToken || null;
  }

  getCopilotTokenExpiresAt(credentials) {
    return (
      credentials?.copilotTokenExpiresAt ||
      credentials?.providerSpecificData?.copilotTokenExpiresAt ||
      null
    );
  }

  buildUrl(model, stream, _urlIndex = 0) {
    const targetFormat = getModelTargetFormat("gh", model);
    const isCodexFamily = typeof model === "string" && /(^|-)codex($|-)/i.test(model);
    if (targetFormat === "openai-responses" || isCodexFamily) {
      return (
        this.config.responsesBaseUrl ||
        this.config.baseUrl?.replace(/\/chat\/completions\/?$/, "/responses") ||
        "https://api.githubcopilot.com/responses"
      );
    }
    return this.config.baseUrl;
  }

  injectResponseFormat(messages: ChatMessage[], responseFormat: ResponseFormat) {
    if (!responseFormat) return messages;

    let formatInstruction = "";
    if (responseFormat.type === "json_object") {
      formatInstruction =
        "Respond only with valid JSON. Do not include any text before or after the JSON object.";
    } else if (responseFormat.type === "json_schema" && responseFormat.json_schema) {
      formatInstruction = `Respond only with valid JSON matching this schema:\n${JSON.stringify(
        responseFormat.json_schema.schema,
        null,
        2
      )}\nDo not include any text before or after the JSON.`;
    }

    if (!formatInstruction) return messages;

    const systemIdx = messages.findIndex((m) => m.role === "system");
    if (systemIdx >= 0) {
      return messages.map((m, i: number) =>
        i === systemIdx ? { ...m, content: `${m.content}\n\n${formatInstruction}` } : m
      );
    }

    return [{ role: "system", content: formatInstruction }, ...messages];
  }

  /**
   * GitHub Copilot `/chat/completions` only accepts OpenAI-style `text` and `image_url`
   * message parts. Clients (Claude Code, OpenCode, etc.) often send `tool_use`, thinking,
   * or other part types that Copilot rejects with HTTP 400. Align with 9router:
   * coerce unknown parts to `text` (see open-sse/executors/github.js sanitizeMessagesForChatCompletions).
   */
  sanitizeMessagesForGitHubChatCompletions(body: unknown): unknown {
    if (!body || typeof body !== "object") return body;
    const bodyWithMessages = body as { messages?: unknown };
    if (!Array.isArray(bodyWithMessages.messages)) return body;
    const bodyObj = body as JsonObject & { messages: ChatMessage[] };
    const out = { ...bodyObj };
    out.messages = bodyObj.messages.map((msg) => {
      if (!msg.content) return msg;
      if (typeof msg.content === "string") return msg;
      if (Array.isArray(msg.content)) {
        const cleanContent = msg.content
          .map((part) => {
            if (part.type === "text") return part;
            if (part.type === "image_url") return part;
            const text = part.text ?? part.content ?? JSON.stringify(part);
            return { type: "text", text: typeof text === "string" ? text : JSON.stringify(text) };
          })
          .filter((part) => part.text !== "");
        return { ...msg, content: cleanContent.length > 0 ? cleanContent : null };
      }
      return msg;
    });
    return out;
  }

  /**
   * OpenCode / Claude Code often send multiple consecutive `system` messages.
   * Copilot is happier with a single merged system block (fewer validation edge cases).
   */
  mergeConsecutiveSystemMessages(messages: ChatMessage[] | undefined): ChatMessage[] {
    if (!Array.isArray(messages) || messages.length === 0) return messages;
    const out: ChatMessage[] = [];
    for (const msg of messages) {
      if (msg.role !== "system") {
        out.push(msg);
        continue;
      }
      const piece =
        typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
      const prev = out[out.length - 1] as { role?: string; content?: unknown } | undefined;
      if (prev?.role === "system") {
        const a =
          typeof prev.content === "string" ? prev.content : JSON.stringify(prev.content ?? "");
        prev.content = `${a}\n\n${piece}`;
      } else {
        out.push({ role: "system", content: piece });
      }
    }
    return out;
  }

  transformRequest(model: string, body: unknown, stream: boolean, credentials: unknown): unknown {
    void stream;
    void credentials;
    const modifiedBody = JSON.parse(JSON.stringify(body)) as JsonObject & {
      messages?: ChatMessage[];
      response_format?: ResponseFormat;
      stream_options?: unknown;
      parallel_tool_calls?: unknown;
      metadata?: unknown;
      user?: unknown;
    };

    if (Array.isArray(modifiedBody.messages)) {
      modifiedBody.messages = this.mergeConsecutiveSystemMessages(modifiedBody.messages);
    }

    if (modifiedBody.response_format && model.toLowerCase().includes("claude")) {
      modifiedBody.messages = this.injectResponseFormat(
        modifiedBody.messages,
        modifiedBody.response_format
      );
      delete modifiedBody.response_format;
    }

    // Strip reasoning_text / reasoning_content from assistant messages.
    // GitHub Copilot converts these into Anthropic thinking blocks but cannot
    // supply a valid `signature`, causing upstream 400 errors.
    if (Array.isArray(modifiedBody.messages)) {
      for (const msg of modifiedBody.messages) {
        if (msg.role === "assistant") {
          delete msg.reasoning_text;
          delete msg.reasoning_content;
          // OpenAI allows null content when tool_calls are present; some clients send "".
          if (msg.content === "" && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
            msg.content = null;
          }
        }
      }
    }

    // Copilot /chat/completions is not guaranteed to accept OpenAI's stream_options
    // (e.g. include_usage); unknown fields can yield 400.
    delete modifiedBody.stream_options;
    // Extra Chat Completions fields that Copilot often rejects or ignores (can cause opaque 400).
    delete modifiedBody.parallel_tool_calls;
    delete modifiedBody.metadata;
    delete modifiedBody.user;

    return this.sanitizeMessagesForGitHubChatCompletions(modifiedBody);
  }

  async execute(input: ExecuteInput) {
    const result = await super.execute(input);
    if (!result || !result.response) return result;

    // Upstream often returns plain text "Bad Request\n" with no JSON — log context for debugging.
    if (result.response.status === 400 && input.log?.warn) {
      const withBody = result as { response: Response; transformedBody?: unknown };
      let requestBodyBytes = 0;
      try {
        if (withBody.transformedBody !== undefined) {
          requestBodyBytes = new TextEncoder().encode(
            JSON.stringify(withBody.transformedBody)
          ).length;
        }
      } catch {
        requestBodyBytes = -1;
      }
      let responsePeek = "";
      try {
        responsePeek = await result.response.clone().text();
      } catch {
        responsePeek = "";
      }
      const headersObj: Record<string, string> = {};
      result.response.headers.forEach((v, k) => {
        headersObj[k] = v;
      });
      input.log.warn(
        "GITHUB_400",
        `requestBodyBytes≈${requestBodyBytes} responsePeek=${JSON.stringify(responsePeek.slice(0, 1500))} headers=${JSON.stringify(headersObj)}`
      );
    }

    if (!input.stream) {
      // wreq-js clone/text semantics consume the original response body. Materialize
      // non-streaming responses immediately so downstream code always sees a native
      // fetch Response with a readable body.
      const status = result.response.status;
      const statusText = result.response.statusText;
      const headers = new Headers(result.response.headers);
      const payload = await result.response.text();
      result.response = new Response(payload, { status, statusText, headers });
      return result;
    }

    if (!result.response.body) return result;

    const isStreaming = input.stream === true;
    const contentType = (result.response.headers.get("content-type") || "").toLowerCase();
    if (isStreaming && result.response.ok && contentType.includes("text/event-stream")) {
      // Preserve the original response body for downstream error handling.
      const sourceResponse = result.response.clone();
      if (!sourceResponse.body) return result;

      const decoder = new TextDecoder();
      const transformStream = new TransformStream({
        transform(chunk, controller) {
          const text = decoder.decode(chunk, { stream: true });
          if (text.includes("data: [DONE]")) {
            return;
          }
          controller.enqueue(chunk);
        },
      });

      const newResponse = new Response(sourceResponse.body.pipeThrough(transformStream), {
        status: sourceResponse.status,
        statusText: sourceResponse.statusText,
        headers: new Headers(sourceResponse.headers),
      });
      result.response = newResponse;
    }

    return result;
  }

  buildHeaders(credentials, stream = true) {
    const token = this.getCopilotToken(credentials) || credentials.accessToken;
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "copilot-integration-id": "vscode-chat",
      "editor-version": "vscode/1.110.0",
      "editor-plugin-version": "copilot-chat/0.38.0",
      "user-agent": "GitHubCopilotChat/0.38.0",
      "openai-intent": "conversation-panel",
      "x-github-api-version": "2025-04-01",
      "x-request-id":
        crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      "x-vscode-user-agent-library-version": "electron-fetch",
      "X-Initiator": "user",
      Accept: stream ? "text/event-stream" : "application/json",
    };
  }

  async refreshCopilotToken(githubAccessToken, log) {
    try {
      const response = await fetch("https://api.github.com/copilot_internal/v2/token", {
        headers: {
          Authorization: `token ${githubAccessToken}`,
          "User-Agent": "GithubCopilot/1.0",
          "Editor-Version": "vscode/1.110.0",
          "Editor-Plugin-Version": "copilot/1.300.0",
          Accept: "application/json",
        },
      });
      if (!response.ok) return null;
      const data = await response.json();
      log?.info?.("TOKEN", "Copilot token refreshed");
      return { token: data.token, expiresAt: data.expires_at };
    } catch (error) {
      log?.error?.("TOKEN", `Copilot refresh error: ${error.message}`);
      return null;
    }
  }

  async refreshGitHubToken(refreshToken, log) {
    try {
      const response = await fetch(OAUTH_ENDPOINTS.github.token, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }),
      });
      if (!response.ok) return null;
      const tokens = await response.json();
      log?.info?.("TOKEN", "GitHub token refreshed");
      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || refreshToken,
        expiresIn: tokens.expires_in,
      };
    } catch (error) {
      log?.error?.("TOKEN", `GitHub refresh error: ${error.message}`);
      return null;
    }
  }

  async refreshCredentials(credentials, log) {
    let copilotResult = await this.refreshCopilotToken(credentials.accessToken, log);

    if (!copilotResult && credentials.refreshToken) {
      const githubTokens = await this.refreshGitHubToken(credentials.refreshToken, log);
      if (githubTokens?.accessToken) {
        copilotResult = await this.refreshCopilotToken(githubTokens.accessToken, log);
        if (copilotResult) {
          return {
            ...githubTokens,
            copilotToken: copilotResult.token,
            copilotTokenExpiresAt: copilotResult.expiresAt,
            providerSpecificData: {
              copilotToken: copilotResult.token,
              copilotTokenExpiresAt: copilotResult.expiresAt,
            },
          };
        }
        return githubTokens;
      }
    }

    if (copilotResult) {
      return {
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        copilotToken: copilotResult.token,
        copilotTokenExpiresAt: copilotResult.expiresAt,
        providerSpecificData: {
          copilotToken: copilotResult.token,
          copilotTokenExpiresAt: copilotResult.expiresAt,
        },
      };
    }

    return null;
  }

  needsRefresh(credentials) {
    // Always refresh if no copilotToken
    if (!this.getCopilotToken(credentials)) return true;

    const copilotTokenExpiresAt = this.getCopilotTokenExpiresAt(credentials);
    if (copilotTokenExpiresAt) {
      // Handle both Unix timestamp (seconds) and ISO string
      let expiresAtMs = copilotTokenExpiresAt;
      if (typeof expiresAtMs === "number" && expiresAtMs < 1e12) {
        expiresAtMs = expiresAtMs * 1000; // Convert seconds to ms
      } else if (typeof expiresAtMs === "string") {
        expiresAtMs = new Date(expiresAtMs).getTime();
      }
      if (expiresAtMs - Date.now() < 5 * 60 * 1000) return true;
    }
    return super.needsRefresh(credentials);
  }
}

export default GithubExecutor;
