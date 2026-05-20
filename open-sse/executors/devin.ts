import { spawn } from "child_process";
import {
  BaseExecutor,
  type ExecutorLog,
  type ProviderCredentials,
  type ExecuteInput,
} from "./base.ts";
import { PROVIDERS } from "../config/constants.ts";

/**
 * DevinExecutor — runs `devin --print <prompt>` as a subprocess.
 *
 * Devin CLI manages its own auth (credentials at ~/.local/share/devin/credentials.toml)
 * and model selection. We spawn it with --print for non-interactive output.
 *
 * Auth: the windsurf_api_key token is validated at import time; the CLI uses it
 * automatically from its credential store — no token injection needed here.
 */
export class DevinExecutor extends BaseExecutor {
  constructor() {
    super("devin", PROVIDERS.devin);
  }

  // Override execute entirely — bypass HTTP and use subprocess instead.
  async execute(input: ExecuteInput): Promise<{
    response: Response;
    url: string;
    headers: Record<string, string>;
    transformedBody: unknown;
  }> {
    const { model, body, stream, signal, log: _log } = input;
    const messages = (body as Record<string, unknown>).messages as
      | Array<{ role: string; content: string }>
      | undefined;

    const prompt = buildPrompt(messages || []);
    const devinBin = findDevinBin();
    const args = buildArgs(prompt, model);

    _log?.info?.("DEVIN_EXEC", `Spawning: ${devinBin} --print [prompt] (model: ${model})`);

    const responseBody = stream
      ? buildSSEStream(devinBin, args, signal ?? null, _log ?? null, model)
      : await runDevinPrint(devinBin, args, signal ?? null, _log ?? null).then((text) =>
          JSON.stringify(buildOpenAIResponse(text, model))
        );

    const response = new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": stream ? "text/event-stream" : "application/json",
      },
    });

    return { response, url: "devin://subprocess", headers: {}, transformedBody: prompt };
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

function findDevinBin(): string {
  const candidates = [
    process.env.DEVIN_BIN,
    `${process.env.HOME}/.local/bin/devin`,
    "/usr/local/bin/devin",
    "/opt/homebrew/bin/devin",
    "devin",
  ].filter(Boolean) as string[];
  return candidates[0];
}

function buildArgs(prompt: string, model: string): string[] {
  const args = ["--print", prompt];
  const devinModels = [
    "adaptive",
    "swe",
    "opus",
    "sonnet",
    "haiku",
    "gpt",
    "gemini",
    "deepseek",
    "kimi",
    "glm",
  ];
  if (model && devinModels.some((m) => model.toLowerCase().includes(m))) {
    args.unshift("--model", model);
  }
  return args;
}

function buildPrompt(messages: Array<{ role: string; content: string }>): string {
  if (messages.length === 0) return "";
  if (messages.length === 1 && messages[0].role === "user") return messages[0].content;
  return messages
    .map((m) => {
      const role = m.role === "assistant" ? "Assistant" : m.role === "system" ? "System" : "User";
      return `${role}: ${m.content}`;
    })
    .join("\n\n");
}

function runDevinPrint(
  bin: string,
  args: string[],
  signal: AbortSignal | null,
  _log: ExecutorLog | null
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(
        new Error(
          `Failed to spawn devin CLI: ${err.message}. Ensure Devin is installed and run \`devin auth login\`.`
        )
      );
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `devin exited with code ${code}`));
        return;
      }
      resolve(stdout.trim());
    });

    if (signal) {
      signal.addEventListener("abort", () => {
        child.kill("SIGTERM");
        reject(new Error("Request aborted"));
      });
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
      let started = false;

      child.stdout.on("data", (chunk: Buffer) => {
        const content = chunk.toString();
        if (!started) {
          // Send role delta on first chunk
          const roleChunk = {
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }],
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(roleChunk)}\n\n`));
          started = true;
        }
        const delta = {
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta: { content }, finish_reason: null }],
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(delta)}\n\n`));
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", (err) => {
        log?.error?.("DEVIN_STREAM", err.message);
        controller.error(new Error(`Failed to spawn devin CLI: ${err.message}`));
      });

      child.on("close", (code) => {
        if (code !== 0) {
          controller.error(new Error(stderr.trim() || `devin exited with code ${code}`));
          return;
        }
        const finish = {
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(finish)}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      });

      if (signal) {
        signal.addEventListener("abort", () => {
          child.kill("SIGTERM");
          controller.error(new Error("Request aborted"));
        });
      }
    },
  });
}

function buildOpenAIResponse(text: string, model: string) {
  return {
    id: `devin-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}
