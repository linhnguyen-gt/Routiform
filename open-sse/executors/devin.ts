import { spawn } from "child_process";
import { accessSync, constants as fsConstants } from "fs";
import {
  BaseExecutor,
  type ExecuteInput,
  type ExecutorLog,
  type ProviderCredentials,
} from "./base.ts";
import { PROVIDERS } from "../config/constants.ts";

type DevinProviderSpecificData = {
  permissionMode?: unknown;
  sandbox?: unknown;
  respectWorkspaceTrust?: unknown;
  continueSession?: unknown;
  resumeSessionId?: unknown;
  agentConfigPath?: unknown;
  configPath?: unknown;
};

type DevinRequestBody = {
  prompt?: unknown;
  messages?: Array<{ role?: string; content?: unknown }>;
  permissionMode?: unknown;
  sandbox?: unknown;
  respectWorkspaceTrust?: unknown;
  continueSession?: unknown;
  resumeSessionId?: unknown;
  agentConfigPath?: unknown;
  configPath?: unknown;
};

export class DevinExecutor extends BaseExecutor {
  constructor() {
    super("devin", PROVIDERS.devin);
  }

  async execute(input: ExecuteInput): Promise<{
    response: Response;
    url: string;
    headers: Record<string, string>;
    transformedBody: unknown;
  }> {
    const { model, body, stream, signal, log, credentials } = input;
    const requestBody = (body || {}) as DevinRequestBody;
    const prompt = resolvePrompt(requestBody);
    const providerSpecificData =
      (credentials.providerSpecificData as DevinProviderSpecificData | undefined) || {};
    const devinBin = findDevinBin();
    const args = buildArgs(prompt, model, requestBody, providerSpecificData);

    log?.info?.("DEVIN_EXEC", `Spawning: ${devinBin} --print [prompt] (model: ${model})`);

    const responseBody = stream
      ? buildSSEStream(devinBin, args, signal ?? null, log ?? null, model)
      : await runDevinPrint(devinBin, args, signal ?? null).then((text) =>
          JSON.stringify(buildDevinResponse(text, model))
        );

    const response = new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": stream ? "text/event-stream" : "application/json",
      },
    });

    return { response, url: "devin://subprocess", headers: {}, transformedBody: requestBody };
  }

  buildUrl() {
    return "devin://subprocess";
  }

  buildHeaders() {
    return {};
  }

  transformRequest(_model: string, body: Record<string, unknown>) {
    return body;
  }

  async refreshCredentials(_credentials: ProviderCredentials, log: ExecutorLog | null) {
    log?.info?.("TOKEN_REFRESH", "Devin: run `devin auth login` to re-authenticate.");
    return null;
  }

  needsRefresh(credentials: ProviderCredentials): boolean {
    if (credentials.expiresAt) {
      return new Date(credentials.expiresAt).getTime() - Date.now() < 5 * 60 * 1000;
    }
    return false;
  }
}

function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function findDevinBin(
  env: NodeJS.ProcessEnv = process.env,
  isExecutable: (path: string) => boolean = isExecutableFile
): string {
  const candidates = [
    env.DEVIN_BIN,
    env.HOME ? `${env.HOME}/.local/bin/devin` : null,
    "/usr/local/bin/devin",
    "/opt/homebrew/bin/devin",
    "devin",
  ].filter(Boolean) as string[];

  return (
    candidates.find((candidate) => candidate === "devin" || isExecutable(candidate)) || "devin"
  );
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildArgs(
  prompt: string,
  model: string,
  body: DevinRequestBody,
  providerSpecificData: DevinProviderSpecificData
): string[] {
  const args: string[] = [];
  if (model && model !== "default") {
    args.push("--model", model);
  }

  const permissionMode =
    asNonEmptyString(body.permissionMode) ||
    asNonEmptyString(providerSpecificData.permissionMode) ||
    "dangerous";
  args.push("--permission-mode", permissionMode);

  const sandbox = asBoolean(body.sandbox) ?? asBoolean(providerSpecificData.sandbox) ?? false;
  if (sandbox) {
    args.push("--sandbox");
  }

  const respectWorkspaceTrust =
    asBoolean(body.respectWorkspaceTrust) ??
    asBoolean(providerSpecificData.respectWorkspaceTrust) ??
    false;
  args.push("--respect-workspace-trust", String(respectWorkspaceTrust));

  const agentConfigPath =
    asNonEmptyString(body.agentConfigPath) ||
    asNonEmptyString(providerSpecificData.agentConfigPath);
  if (agentConfigPath) {
    args.push("--agent-config", agentConfigPath);
  }

  const configPath =
    asNonEmptyString(body.configPath) || asNonEmptyString(providerSpecificData.configPath);
  if (configPath) {
    args.push("--config", configPath);
  }

  const resumeSessionId =
    asNonEmptyString(body.resumeSessionId) ||
    asNonEmptyString(providerSpecificData.resumeSessionId);
  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
  } else {
    const continueSession =
      asBoolean(body.continueSession) ?? asBoolean(providerSpecificData.continueSession) ?? false;
    if (continueSession) {
      args.push("--continue");
    }
  }

  args.push("--print", prompt);
  return args;
}

function resolvePrompt(body: DevinRequestBody): string {
  if (typeof body.prompt === "string") return body.prompt;
  if (!Array.isArray(body.messages)) return "";
  return body.messages
    .map((message) => {
      const role = typeof message?.role === "string" ? message.role : "user";
      const content =
        typeof message?.content === "string"
          ? message.content
          : JSON.stringify(message?.content ?? "");
      return `${role}: ${content}`;
    })
    .join("\n\n");
}

function runDevinPrint(bin: string, args: string[], signal: AbortSignal | null): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finalize = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener("abort", onAbort);
      fn();
    };

    const onAbort = () => {
      child.kill("SIGTERM");
      finalize(() => reject(new Error("Request aborted")));
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      finalize(() =>
        reject(
          new Error(
            `Failed to spawn devin CLI: ${err.message}. Ensure Devin is installed and run \`devin auth login\`.`
          )
        )
      );
    });

    child.on("close", (code) => {
      finalize(() => {
        if (code !== 0) {
          reject(new Error(stderr.trim() || `devin exited with code ${code}`));
          return;
        }
        resolve(stdout.trim());
      });
    });

    if (signal) {
      signal.addEventListener("abort", onAbort);
    }
  });
}

function buildSSEStream(
  bin: string,
  args: string[],
  signal: AbortSignal | null,
  log: ExecutorLog | null,
  model: string
): ReadableStream {
  const encoder = new TextEncoder();
  const id = `devin-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  return new ReadableStream({
    start(controller) {
      const child = spawn(bin, args, {
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      let closed = false;

      const emitEvent = (event: Record<string, unknown>) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const finalizeError = (error: Error) => {
        if (closed) return;
        closed = true;
        if (signal) signal.removeEventListener("abort", onAbort);
        controller.error(error);
      };

      const finalizeClose = () => {
        if (closed) return;
        closed = true;
        if (signal) signal.removeEventListener("abort", onAbort);
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      };

      const onAbort = () => {
        child.kill("SIGTERM");
        finalizeError(new Error("Request aborted"));
      };

      emitEvent({ type: "start", id, created, model });

      child.stdout.on("data", (chunk: Buffer) => {
        emitEvent({ type: "text-delta", id, created, model, delta: chunk.toString() });
      });

      child.stderr.on("data", (chunk: Buffer) => {
        const delta = chunk.toString();
        stderr += delta;
        emitEvent({ type: "reasoning-delta", id, created, model, delta });
      });

      child.on("error", (err) => {
        log?.error?.("DEVIN_STREAM", err.message);
        finalizeError(new Error(`Failed to spawn devin CLI: ${err.message}`));
      });

      child.on("close", (code) => {
        if (code !== 0) {
          finalizeError(new Error(stderr.trim() || `devin exited with code ${code}`));
          return;
        }
        emitEvent({
          type: "finish",
          id,
          created,
          model,
          finishReason: "stop",
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        });
        finalizeClose();
      });

      if (signal) {
        signal.addEventListener("abort", onAbort);
      }
    },
  });
}

function buildDevinResponse(text: string, model: string) {
  return {
    id: `devin-${Date.now()}`,
    object: "devin.response",
    created: Math.floor(Date.now() / 1000),
    model,
    output_text: text,
    finish_reason: "stop",
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}
