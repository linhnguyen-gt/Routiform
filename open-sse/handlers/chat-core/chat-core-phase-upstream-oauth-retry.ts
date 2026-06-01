import { HTTP_STATUS } from "../../config/constants.ts";
import { refreshWithRetry } from "../../services/tokenRefresh.ts";
import type { ChatCorePipeline } from "./chat-core-pipeline.ts";

export async function chatCorePhaseUpstreamOauthRetry(p: ChatCorePipeline): Promise<void> {
  const log = p.log as {
    info?: (t: string, m: string) => void;
    warn?: (t: string, m: string) => void;
  };
  const credentials = p.credentials as {
    refreshToken?: string;
  } & Record<string, unknown>;
  const translatedBody = p.translatedBody as Record<string, unknown>;
  const effectiveModel = p.effectiveModel || "";
  const executor = p.executor as {
    execute: (args: Record<string, unknown>) => Promise<{
      response: Response;
      url: string;
      headers: Headers;
      transformedBody: unknown;
    }>;
    refreshCredentials: (c: unknown, log: unknown) => Promise<unknown>;
  };
  const getExecutionCredentials = p.getExecutionCredentials as () => unknown;
  const buildUpstreamHeadersForExecute = p.buildUpstreamHeadersForExecute as (
    id: string
  ) => unknown;
  const streamController = p.streamController as NonNullable<ChatCorePipeline["streamController"]>;
  const reqLogger = p.reqLogger as {
    logTargetRequest: (u: string, h: Headers, b: unknown) => void;
  };

  let providerResponse = p.providerResponse as Response;
  let providerUrl = p.providerUrl as string;
  let providerHeaders = p.providerHeaders as Headers;
  let finalBody = p.finalBody;

  let upstreamErrorParsed = false;
  let parsedStatusCode = providerResponse.status;
  let parsedMessage = "";
  let parsedRetryAfterMs: number | null = null;
  let upstreamErrorBody: unknown = null;

  const streamOptionsOnlyFailed = false;
  const canOAuthRefresh = credentials?.refreshToken && typeof credentials.refreshToken === "string";

  if (
    (providerResponse.status === HTTP_STATUS.UNAUTHORIZED ||
      providerResponse.status === HTTP_STATUS.FORBIDDEN) &&
    !streamOptionsOnlyFailed &&
    canOAuthRefresh
  ) {
    const newCredentials = (await refreshWithRetry(
      () => executor.refreshCredentials(credentials, log),
      3,
      log,
      p.provider
    )) as null | {
      accessToken?: string;
      copilotToken?: string;
    };

    if (newCredentials?.accessToken || newCredentials?.copilotToken) {
      log?.info?.("TOKEN", `${p.provider.toUpperCase()} | refreshed`);
      Object.assign(credentials, newCredentials);
      if (p.onCredentialsRefreshed && newCredentials) {
        await p.onCredentialsRefreshed(newCredentials);
      }
      try {
        const retryModelId = String(translatedBody.model || effectiveModel);
        const retryResult = await executor.execute({
          model: retryModelId,
          body: translatedBody,
          stream: p.upstreamStream,
          credentials: getExecutionCredentials(),
          signal: streamController.signal,
          log,
          extendedContext: p.extendedContext,
          upstreamExtraHeaders: buildUpstreamHeadersForExecute(retryModelId),
        });
        if (retryResult.response.ok) {
          providerResponse = retryResult.response;
          providerUrl = retryResult.url;
          providerHeaders = retryResult.headers;
          finalBody = retryResult.transformedBody;
          reqLogger.logTargetRequest(providerUrl, providerHeaders, finalBody);
          upstreamErrorParsed = false;
        } else {
          providerResponse = retryResult.response;
          upstreamErrorParsed = false;
        }
      } catch {
        log?.warn?.("TOKEN", `${p.provider.toUpperCase()} | retry after refresh failed`);
      }
    } else {
      log?.warn?.("TOKEN", `${p.provider.toUpperCase()} | refresh failed`);
    }
  }

  p.providerResponse = providerResponse;
  p.providerUrl = providerUrl;
  p.providerHeaders = providerHeaders;
  p.finalBody = finalBody;
  p.upstreamErrorParsed = upstreamErrorParsed;
  p.parsedStatusCode = parsedStatusCode;
  p.parsedMessage = parsedMessage;
  p.parsedRetryAfterMs = parsedRetryAfterMs;
  p.upstreamErrorBody = upstreamErrorBody;
  p.streamOptionsOnlyFailed = streamOptionsOnlyFailed;
}
