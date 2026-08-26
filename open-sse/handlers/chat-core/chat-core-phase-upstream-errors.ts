import { trackPendingRequest } from "@/lib/usageDb";
import { HTTP_STATUS } from "../../config/constants.ts";
import { updateFromHeaders } from "../../services/rateLimitManager.ts";
import { formatProviderError, parseUpstreamError } from "../../utils/error.ts";
import { COLORS } from "../../utils/stream.ts";
import { persistProviderAccountErrorState } from "../services/provider-account-error-state.ts";
import { isHealthCheckProbe } from "./chat-core-health-check-probe.ts";
import {
  runUpstreamNotOkFallbackChain,
  type NotOkMutable,
} from "./chat-core-upstream-not-ok-fallback-chain.ts";
import type { ChatCorePipeline } from "./chat-core-pipeline.ts";

type PhaseOutcome = { done: true; result: unknown } | { done: false };

export async function chatCorePhaseUpstreamErrors(p: ChatCorePipeline): Promise<PhaseOutcome> {
  let providerResponse = p.providerResponse as Response;
  if (providerResponse.ok) {
    return { done: false };
  }

  const log = p.log as {
    warn?: (t: string, m: string) => void;
    debug?: (t: string, m: string) => void;
    info?: (t: string, m: string) => void;
  };
  const translatedBody = p.translatedBody as Record<string, unknown>;
  const reqLogger = p.reqLogger as {
    logError: (e: Error, b: unknown) => void;
    logProviderResponse: (s: number, t: string, h: Headers, b: unknown) => void;
  };

  let providerUrl = p.providerUrl as string;
  let providerHeaders = p.providerHeaders as Headers;
  let finalBody = p.finalBody;
  let upstreamErrorBody = p.upstreamErrorBody;
  const triedModels = p.triedModels as Set<string>;
  let currentModel = p.currentModel as string;
  const effectiveModel = p.effectiveModel || "";
  const upstreamErrorParsed = !!p.upstreamErrorParsed;
  let parsedStatusCode = p.parsedStatusCode as number;
  let parsedMessage = p.parsedMessage as string;
  let parsedRetryAfterMs = p.parsedRetryAfterMs ?? null;

  trackPendingRequest(p.model, p.provider, p.connectionId, false);

  let statusCode = providerResponse.status;
  let message = "";
  let retryAfterMs: number | null = null;

  if (upstreamErrorParsed) {
    statusCode = parsedStatusCode;
    message = parsedMessage;
    retryAfterMs = parsedRetryAfterMs;
  } else {
    const details = await parseUpstreamError(providerResponse, p.provider);
    statusCode = details.statusCode;
    message = details.message;
    retryAfterMs = details.retryAfterMs;
    upstreamErrorBody = details.responseBody;
  }

  const failedUpstreamModel = String(
    translatedBody.model || currentModel || effectiveModel || p.model
  );

  // A probe reports its own failure to whoever asked for it; recording that failure
  // against the account would let testing one unusable model take the whole connection
  // out of service, and every later probe on it then fails with "no credentials".
  if (isHealthCheckProbe(p.clientRawRequest as { headers?: Headers } | null | undefined)) {
    log?.debug?.(
      "TEST",
      `Health-check probe failed (${statusCode}) for ${failedUpstreamModel} — account state left untouched`
    );
  } else {
    await persistProviderAccountErrorState({
      connectionId: p.connectionId,
      provider: p.provider,
      model: failedUpstreamModel,
      statusCode,
      message,
      retryAfterMs,
    });
  }

  const errMsg = formatProviderError(new Error(message), p.provider, p.model, statusCode);
  console.log(`${COLORS.red}[ERROR] ${errMsg}${COLORS.reset}`);

  if (p.provider === "github" && statusCode === HTTP_STATUS.BAD_REQUEST && message) {
    log?.warn?.(
      "GITHUB",
      `chat/completions 400 — ${message}${upstreamErrorBody != null ? ` | response=${JSON.stringify(upstreamErrorBody).slice(0, 800)}` : ""}`
    );
  }

  if (p.provider === "kiro" && statusCode === HTTP_STATUS.BAD_REQUEST) {
    log?.warn?.(
      "KIRO",
      `400 malformed — ${message}${upstreamErrorBody != null ? ` | response=${JSON.stringify(upstreamErrorBody).slice(0, 800)}` : ""}`
    );
  }

  if (retryAfterMs && p.provider === "antigravity") {
    const retrySeconds = Math.ceil(retryAfterMs / 1000);
    log?.debug?.("RETRY", `Antigravity quota reset in ${retrySeconds}s (${retryAfterMs}ms)`);
  }

  reqLogger.logError(new Error(message), finalBody || translatedBody);
  reqLogger.logProviderResponse(
    providerResponse.status,
    providerResponse.statusText,
    providerResponse.headers,
    upstreamErrorBody
  );

  updateFromHeaders(p.provider, p.connectionId, providerResponse.headers, statusCode, p.model);

  const notOk: NotOkMutable = {
    providerResponse,
    providerUrl,
    providerHeaders,
    finalBody: finalBody as unknown,
    currentModel,
    upstreamErrorBody,
  };
  const chainR = await runUpstreamNotOkFallbackChain(p, notOk, {
    statusCode,
    message,
    retryAfterMs,
    errMsg,
    translatedBody,
    triedModels,
  });
  if (chainR.done) return chainR;

  p.providerResponse = notOk.providerResponse;
  p.providerUrl = notOk.providerUrl;
  p.providerHeaders = notOk.providerHeaders;
  p.finalBody = notOk.finalBody;
  p.upstreamErrorBody = notOk.upstreamErrorBody;
  p.currentModel = notOk.currentModel;

  return { done: false };
}
