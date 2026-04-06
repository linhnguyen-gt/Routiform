import { platform, arch } from "node:os";
import { DefaultExecutor } from "./default.ts";
import type { ProviderCredentials } from "./base.ts";

/**
 * Qwen Code (OAuth) — aligned with 9router / CLIProxyAPI qwen_executor:
 * always POST to portal OpenAI-compatible endpoint; do not route OAuth
 * resource_url to dashscope hosts (differs from generic DashScope API keys).
 */
const QWEN_CODE_VERSION = "0.13.2";
const qwenStainless = {
  runtimeVersion: "v22.17.0",
  lang: "js",
  packageVersion: "5.11.0",
  retryCount: "0",
  runtime: "node",
};

const qwenDefaultSystemMessage = {
  role: "system",
  content: [{ type: "text", text: "", cache_control: { type: "ephemeral" } }],
};

function qwenStainlessOsLabel(): string {
  const p = platform();
  if (p === "darwin") return "MacOS";
  if (p === "win32") return "Windows";
  if (p === "linux") return "Linux";
  return p;
}

function qwenUserAgent(): string {
  return `QwenCode/${QWEN_CODE_VERSION} (${platform()}; ${arch()})`;
}

function ensureQwenSystemMessage(body: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  if (Array.isArray(next.messages)) {
    next.messages = [qwenDefaultSystemMessage, ...next.messages];
  } else {
    next.messages = [qwenDefaultSystemMessage];
  }
  return next;
}

export class QwenExecutor extends DefaultExecutor {
  constructor() {
    super("qwen");
  }

  buildUrl(
    model: string,
    stream: boolean,
    urlIndex = 0,
    credentials: ProviderCredentials | null = null
  ): string {
    void model;
    void stream;
    void urlIndex;
    void credentials;
    return "https://portal.qwen.ai/v1/chat/completions";
  }

  buildHeaders(credentials: ProviderCredentials, stream = true): Record<string, string> {
    const token = credentials?.apiKey || credentials?.accessToken || "";
    const ua = qwenUserAgent();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "User-Agent": ua,
      "X-Dashscope-UserAgent": ua,
      "X-Stainless-Runtime-Version": qwenStainless.runtimeVersion,
      "X-Stainless-Lang": qwenStainless.lang,
      "X-Stainless-Arch": arch(),
      "X-Stainless-Package-Version": qwenStainless.packageVersion,
      "X-Dashscope-CacheControl": "enable",
      "X-Stainless-Retry-Count": qwenStainless.retryCount,
      "X-Stainless-Os": qwenStainlessOsLabel(),
      "X-Dashscope-AuthType": "qwen-oauth",
      "X-Stainless-Runtime": qwenStainless.runtime,
    };
    headers.Accept = stream ? "text/event-stream" : "application/json";
    return headers;
  }

  transformRequest(
    model: string,
    body: unknown,
    stream: boolean,
    credentials: ProviderCredentials | null
  ): unknown {
    void model;
    void credentials;
    if (!body || typeof body !== "object" || body === null) return body;
    const next: Record<string, unknown> = { ...(body as Record<string, unknown>) };
    if (stream && Array.isArray(next.messages) && next.stream_options === undefined) {
      next.stream_options = { include_usage: true };
    }
    return ensureQwenSystemMessage(next);
  }
}

export default QwenExecutor;
