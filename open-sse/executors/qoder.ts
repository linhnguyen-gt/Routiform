import crypto from "crypto";
import { spawn } from "child_process";
import {
  BaseExecutor,
  mergeUpstreamExtraHeaders,
  type ExecuteInput,
  type ProviderCredentials,
} from "./base.ts";
import { PROVIDERS } from "../config/constants.ts";
import {
  buildQoderChunk,
  buildQoderCompletionPayload,
  buildQoderPrompt,
  createQoderErrorResponse,
  extractTextFromQoderEnvelope,
  getQoderCliCommand,
  getQoderCliWorkspace,
  mapQoderModelToLevel,
  parseQoderCliFailure,
  runQoderCliCommand,
} from "../services/qoderCli.ts";

function getPat(credentials: ProviderCredentials): string {
  if (typeof credentials.apiKey === "string" && credentials.apiKey.trim()) {
    return credentials.apiKey.trim();
  }
  return "";
}

export class QoderExecutor extends BaseExecutor {
  constructor() {
    super("qoder", PROVIDERS.qoder);
  }

  buildHeaders(_credentials: ProviderCredentials, stream = true): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(stream ? { Accept: "text/event-stream" } : {}),
    };
  }

  async execute({
    model,
    body,
    stream,
    credentials,
    signal,
    upstreamExtraHeaders,
  }: ExecuteInput) {
    const headers = this.buildHeaders(credentials, stream);
    mergeUpstreamExtraHeaders(headers, upstreamExtraHeaders);

    const pat = getPat(credentials);
    if (!pat) {
      return {
        response: createQoderErrorResponse({
          status: 400,
          message:
            "Qoder Personal Access Token is required. Connect Qoder with a PAT via qodercli transport.",
          code: "pat_required",
        }),
        url: "qodercli://local",
        headers,
        transformedBody: body,
      };
    }

    const prompt = buildQoderPrompt(body);
    const workspace = getQoderCliWorkspace();
    const command = getQoderCliCommand();

    if (!stream) {
      const result = await runQoderCliCommand({
        token: pat,
        prompt,
        stream: false,
        model,
        workspace,
        command,
        signal,
      });

      if (!result.ok) {
        const failure = parseQoderCliFailure(result.stderr || result.error || "", result.stdout);
        return {
          response: createQoderErrorResponse(failure),
          url: "qodercli://local",
          headers,
          transformedBody: body,
        };
      }

      let assistantText = result.stdout.trim();
      try {
        const parsed = JSON.parse(assistantText);
        assistantText = extractTextFromQoderEnvelope(parsed) || assistantText;
      } catch {
        // Fall back to raw stdout if the CLI printed plain text.
      }

      const payload = buildQoderCompletionPayload({
        model,
        text: assistantText,
      });

      return {
        response: new Response(JSON.stringify(payload), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }),
        url: "qodercli://local",
        headers,
        transformedBody: body,
      };
    }

    const qoderStream = new ReadableStream({
      start: async (controller) => {
        const encoder = new TextEncoder();
        const created = Math.floor(Date.now() / 1000);
        const responseId = `chatcmpl-${crypto.randomUUID()}`;
        const responseModel = model || "qoder-rome-30ba3b";
        const cliCommand = command;
        const args = [
          "-q",
          "-p",
          prompt,
          "--max-turns",
          "1",
          "--workspace",
          workspace,
          "--output-format",
          "stream-json",
        ];
        const level = mapQoderModelToLevel(responseModel);
        if (level) {
          args.push("--model", level);
        }

        const child = spawn(cliCommand, args, {
          env: {
            ...process.env,
            QODER_PERSONAL_ACCESS_TOKEN: pat,
          },
          stdio: ["ignore", "pipe", "pipe"],
          ...(process.platform === "win32" ? { shell: true } : {}),
        });

        let stdoutBuffer = "";
        let stderrBuffer = "";
        let emittedText = "";
        let roleSent = false;
        let finished = false;

        const emitSse = (payload: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        const finish = () => {
          if (finished) return;
          finished = true;
          emitSse(
            buildQoderChunk({
              id: responseId,
              model: responseModel,
              created,
              delta: {},
              finishReason: "stop",
            })
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        };

        const abortChild = () => {
          try {
            child.kill("SIGTERM");
          } catch {}
        };

        if (signal?.aborted) {
          abortChild();
          controller.error(new Error("aborted"));
          return;
        }

        signal?.addEventListener?.(
          "abort",
          () => {
            abortChild();
            controller.error(new Error("aborted"));
          },
          { once: true }
        );

        const emitDelta = (deltaText: string) => {
          if (!deltaText) return;
          const delta = roleSent
            ? { content: deltaText }
            : { role: "assistant", content: deltaText };
          roleSent = true;
          emitSse(
            buildQoderChunk({
              id: responseId,
              model: responseModel,
              created,
              delta,
            })
          );
        };

        const drainStdout = () => {
          let newlineIndex = stdoutBuffer.indexOf("\n");
          while (newlineIndex >= 0) {
            const rawLine = stdoutBuffer.slice(0, newlineIndex).trim();
            stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
            newlineIndex = stdoutBuffer.indexOf("\n");

            if (!rawLine) continue;

            let parsed: unknown;
            try {
              parsed = JSON.parse(rawLine);
            } catch {
              continue;
            }

            const nextText = extractTextFromQoderEnvelope(parsed);
            if (nextText) {
              const delta = nextText.startsWith(emittedText)
                ? nextText.slice(emittedText.length)
                : nextText;
              emittedText += delta;
              emitDelta(delta);
            }

            const parsedRecord =
              parsed && typeof parsed === "object" && !Array.isArray(parsed)
                ? (parsed as Record<string, unknown>)
                : {};
            if (parsedRecord.type === "result" && parsedRecord.done === true) {
              finish();
              return;
            }
          }
        };

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");

        child.stdout.on("data", (chunk) => {
          stdoutBuffer += chunk;
          drainStdout();
        });

        child.stderr.on("data", (chunk) => {
          stderrBuffer += chunk;
        });

        child.on("error", (error) => {
          if (finished) return;
          controller.error(error);
        });

        child.on("close", (code) => {
          if (finished) return;
          drainStdout();
          if (code !== 0) {
            const failure = parseQoderCliFailure(stderrBuffer, stdoutBuffer);
            controller.error(new Error(failure.message));
            return;
          }
          finish();
        });
      },
    });

    return {
      response: new Response(qoderStream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      }),
      url: "qodercli://local",
      headers,
      transformedBody: body,
    };
  }
}

export default QoderExecutor;
