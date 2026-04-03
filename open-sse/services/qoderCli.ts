import { spawn } from "child_process";
import crypto from "crypto";

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_TURNS = "1";
const QODER_DEFAULT_MODEL = "qoder-rome-30ba3b";

export const QODER_STATIC_MODELS = [
  { id: "qoder-rome-30ba3b", name: "Qoder ROME" },
  { id: "qwen3-coder-plus", name: "Qwen3 Coder Plus" },
  { id: "qwen3-max", name: "Qwen3 Max" },
  { id: "qwen3-vl-plus", name: "Qwen3 Vision Plus" },
  { id: "kimi-k2-0905", name: "Kimi K2 0905" },
  { id: "qwen3-max-preview", name: "Qwen3 Max Preview" },
  { id: "kimi-k2", name: "Kimi K2" },
  { id: "deepseek-v3.2", name: "DeepSeek V3.2" },
  { id: "deepseek-r1", name: "DeepSeek R1" },
  { id: "deepseek-v3", name: "DeepSeek V3" },
  { id: "qwen3-32b", name: "Qwen3 32B" },
  { id: "qwen3-235b-a22b-thinking-2507", name: "Qwen3 235B A22B Thinking 2507" },
  { id: "qwen3-235b-a22b-instruct", name: "Qwen3 235B A22B Instruct" },
  { id: "qwen3-235b", name: "Qwen3 235B" },
];

type JsonRecord = Record<string, unknown>;

type QoderCliRunOptions = {
  token: string;
  prompt: string;
  stream: boolean;
  model?: string | null;
  workspace?: string | null;
  command?: string | null;
  signal?: AbortSignal | null;
  timeoutMs?: number;
};

type QoderCliRunResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  error: string | null;
};

type QoderCliFailure = {
  status: number;
  message: string;
  code: string;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function getQoderCliCommand(): string {
  const explicit = String(process.env.CLI_QODER_BIN || "").trim();
  return explicit || "qodercli";
}

export function getQoderCliWorkspace(): string {
  const explicit = String(
    process.env.QODER_CLI_WORKSPACE || process.env.OMNIROUTE_QODER_WORKSPACE || ""
  ).trim();
  if (explicit) return explicit;
  const home = String(process.env.HOME || "").trim();
  return home || process.cwd();
}

export function normalizeQoderPatProviderData(providerSpecificData: JsonRecord = {}): JsonRecord {
  return {
    ...providerSpecificData,
    authMode: "pat",
    transport: "qodercli",
  };
}

export function isQoderCliTransport(providerSpecificData: unknown = {}): boolean {
  const data = asRecord(providerSpecificData);
  const transport = getString(data.transport).trim().toLowerCase();
  const authMode = getString(data.authMode).trim().toLowerCase();
  if (transport === "http-legacy") return false;
  return transport === "qodercli" || authMode === "pat";
}

export function getStaticQoderModels() {
  return QODER_STATIC_MODELS.map((model) => ({ ...model }));
}

export function mapQoderModelToLevel(model: string | null | undefined): string | null {
  const normalized = String(model || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("deepseek-r1")) return "ultimate";
  if (normalized.includes("qwen3-max")) return "performance";
  if (normalized.includes("kimi-k2")) return "kmodel";
  if (normalized.includes("qwen3-coder")) return "qmodel";
  if (normalized.includes("qoder-rome")) return "qmodel";
  return "auto";
}

function flattenMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";

      const record = item as JsonRecord;
      const itemType = getString(record.type);
      if (itemType === "text" || itemType === "input_text") {
        return getString(record.text);
      }
      if (itemType === "image_url" || itemType === "input_image") {
        return "[Image omitted]";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function formatMessage(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const record = message as JsonRecord;
  const role = getString(record.role).trim().toUpperCase() || "UNKNOWN";
  const base = flattenMessageContent(record.content);

  if (role === "TOOL") {
    const toolName = getString(record.name).trim();
    return `TOOL${toolName ? ` (${toolName})` : ""}:\n${base}`.trim();
  }

  const toolCalls = Array.isArray(record.tool_calls) ? record.tool_calls : [];
  if (toolCalls.length > 0) {
    const toolLines = toolCalls
      .map((toolCall) => {
        const toolRecord = asRecord(toolCall);
        const functionRecord = asRecord(toolRecord.function);
        const toolName =
          getString(functionRecord.name).trim() || getString(toolRecord.name).trim() || "tool";
        const toolArgs =
          getString(functionRecord.arguments).trim() || getString(toolRecord.arguments).trim();
        return `TOOL_CALL ${toolName}: ${toolArgs}`.trim();
      })
      .filter(Boolean)
      .join("\n");

    return `${role}:\n${base}\n${toolLines}`.trim();
  }

  return `${role}:\n${base}`.trim();
}

export function buildQoderPrompt(body: unknown): string {
  const requestBody = asRecord(body);
  const lines = [
    "You are answering an OmniRoute OpenAI-compatible request through the Qoder CLI transport.",
    "Respond as a plain language model only.",
    "Do not use your own tools, do not inspect files, and do not run commands.",
    "Do not mention the adapter unless the user explicitly asks.",
  ];

  const tools = Array.isArray(requestBody.tools) ? requestBody.tools : [];
  if (tools.length > 0) {
    const toolNames = tools
      .map((tool) => {
        const toolRecord = asRecord(tool);
        const functionRecord =
          toolRecord.type === "function" ? asRecord(toolRecord.function) : toolRecord;
        return getString(functionRecord.name).trim();
      })
      .filter(Boolean)
      .join(", ");

    if (toolNames) {
      lines.push(`Caller-side tools are available externally: ${toolNames}.`);
      lines.push("Do not call those tools yourself. Answer in assistant text only.");
    }
  }

  const responseFormat = asRecord(requestBody.response_format);
  if (responseFormat.type === "json_object") {
    lines.push("Return only valid JSON.");
  } else if (
    responseFormat.type === "json_schema" &&
    responseFormat.json_schema &&
    typeof responseFormat.json_schema === "object"
  ) {
    const jsonSchema = asRecord(responseFormat.json_schema);
    if (jsonSchema.schema && typeof jsonSchema.schema === "object") {
      lines.push(
        `Return only valid JSON matching this schema:\n${JSON.stringify(jsonSchema.schema, null, 2)}`
      );
    }
  }

  const messages = Array.isArray(requestBody.messages)
    ? requestBody.messages
    : Array.isArray(requestBody.input)
      ? requestBody.input
      : [];

  if (messages.length > 0) {
    lines.push("Conversation transcript:");
    for (const message of messages) {
      const formatted = formatMessage(message);
      if (formatted) lines.push(formatted);
    }
  }

  lines.push("Reply now with the assistant response only.");
  return lines.filter(Boolean).join("\n\n");
}

export function extractTextFromQoderEnvelope(parsed: unknown): string {
  const record = asRecord(parsed);
  const messageRecord = asRecord(record.message);
  const content = messageRecord.content ?? record.content ?? record.delta ?? record.text ?? null;

  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((item) => {
      const itemRecord = asRecord(item);
      const itemType = getString(itemRecord.type).trim();
      if (itemType === "text" || !itemType) {
        return getString(itemRecord.text);
      }
      return "";
    })
    .filter(Boolean)
    .join("");
}

export function buildQoderCompletionPayload({
  model,
  text,
}: {
  model?: string | null;
  text: string;
}) {
  const created = Math.floor(Date.now() / 1000);
  return {
    id: `chatcmpl-${crypto.randomUUID()}`,
    object: "chat.completion",
    created,
    model: model || QODER_DEFAULT_MODEL,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

export function buildQoderChunk({
  id,
  model,
  created,
  delta,
  finishReason = null,
}: {
  id: string;
  model: string;
  created: number;
  delta: Record<string, unknown>;
  finishReason?: string | null;
}) {
  return {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
      },
    ],
  };
}

export function parseQoderCliFailure(stderrText: string, stdoutText = ""): QoderCliFailure {
  const stderr = String(stderrText || "").trim();
  const stdout = String(stdoutText || "").trim();
  const combined = `${stderr}\n${stdout}`.trim() || "Qoder CLI request failed";
  const normalized = combined.toLowerCase();

  if (
    normalized.includes("invalid api key") ||
    normalized.includes("invalid token") ||
    normalized.includes("personal access token") ||
    (normalized.includes("unauthorized") && normalized.includes("qoder"))
  ) {
    return { status: 401, message: combined, code: "upstream_auth_error" };
  }

  if (
    normalized.includes("command not found") ||
    normalized.includes("not installed") ||
    normalized.includes("enoent") ||
    normalized.includes("no such file or directory")
  ) {
    return { status: 503, message: combined, code: "runtime_error" };
  }

  if (normalized.includes("timed out") || normalized.includes("timeout")) {
    return { status: 504, message: combined, code: "timeout" };
  }

  return { status: 502, message: combined, code: "upstream_error" };
}

export function createQoderErrorResponse(failure: QoderCliFailure): Response {
  return new Response(
    JSON.stringify({
      error: {
        message: failure.message,
        type: failure.status === 401 ? "authentication_error" : "provider_error",
        code: failure.code,
      },
    }),
    {
      status: failure.status,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

export async function runQoderCliCommand({
  token,
  prompt,
  stream,
  model,
  workspace,
  command,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: QoderCliRunOptions): Promise<QoderCliRunResult> {
  const cliCommand = String(command || getQoderCliCommand()).trim();
  const cwd = String(workspace || getQoderCliWorkspace()).trim() || process.cwd();
  const args = [
    "-q",
    "-p",
    prompt,
    "--max-turns",
    DEFAULT_MAX_TURNS,
    "--workspace",
    cwd,
    "--output-format",
    stream ? "stream-json" : "json",
  ];

  const level = mapQoderModelToLevel(model || QODER_DEFAULT_MODEL);
  if (level) {
    args.push("--model", level);
  }

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const child = spawn(cliCommand, args, {
      env: {
        ...process.env,
        QODER_PERSONAL_ACCESS_TOKEN: token,
      },
      stdio: ["ignore", "pipe", "pipe"],
      ...(process.platform === "win32" ? { shell: true } : {}),
    });

    const cleanup = (result: QoderCliRunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", abortHandler);
      resolve(result);
    };

    const abortChild = () => {
      try {
        child.kill("SIGTERM");
      } catch {}
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {}
      }, 250).unref?.();
    };

    const abortHandler = () => {
      abortChild();
      cleanup({
        ok: false,
        code: null,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        timedOut: false,
        error: "aborted",
      });
    };

    if (signal?.aborted) {
      abortHandler();
      return;
    }

    signal?.addEventListener?.("abort", abortHandler, { once: true });

    const timer = setTimeout(() => {
      timedOut = true;
      abortChild();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      cleanup({
        ok: false,
        code: null,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        timedOut,
        error: error?.message || "spawn_error",
      });
    });

    child.on("close", (code) => {
      cleanup({
        ok: !timedOut && code === 0,
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        timedOut,
        error: timedOut ? "timeout" : null,
      });
    });
  });
}

export async function validateQoderCliPat({
  apiKey,
  providerSpecificData = {},
}: {
  apiKey: string;
  providerSpecificData?: JsonRecord;
}) {
  const modelId =
    getString(providerSpecificData.validationModelId).trim() || getString(providerSpecificData.modelId).trim();
  const result = await runQoderCliCommand({
    token: apiKey,
    prompt: "Reply with OK only.",
    stream: false,
    model: modelId || QODER_DEFAULT_MODEL,
    workspace: getQoderCliWorkspace(),
    timeoutMs: 30_000,
  });

  if (!result.ok) {
    const failure = parseQoderCliFailure(result.stderr || result.error || "", result.stdout);
    return {
      valid: false,
      error: failure.status === 401 ? "Invalid API key" : failure.message,
      unsupported: false,
    };
  }

  return { valid: true, error: null, unsupported: false };
}
