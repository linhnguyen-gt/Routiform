import { getCorsOrigin } from "../utils/cors.ts";
/**
 * Responses API Handler for Workers
 * Converts Chat Completions to Codex Responses API format
 */

import { handleChatCore } from "./chatCore.ts";
import { convertResponsesApiFormat } from "../translator/helpers/responsesApiHelper.ts";
import { createResponsesApiTransformStream } from "../transformer/responsesTransformer.ts";
import { FORMATS } from "../translator/formats.ts";

type ResponsesModelInfo = {
  provider: string;
  model: string;
  extendedContext?: boolean;
  sourceFormat?: string;
  targetFormat?: string;
  format?: string;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toResponsesModelInfo(modelInfo: unknown): ResponsesModelInfo | null {
  if (!isPlainRecord(modelInfo)) return null;
  if (typeof modelInfo.provider !== "string" || typeof modelInfo.model !== "string") {
    return null;
  }

  const normalized: ResponsesModelInfo = {
    provider: modelInfo.provider,
    model: modelInfo.model,
  };

  if (typeof modelInfo.extendedContext === "boolean") {
    normalized.extendedContext = modelInfo.extendedContext;
  }
  if (typeof modelInfo.sourceFormat === "string") {
    normalized.sourceFormat = modelInfo.sourceFormat;
  }
  if (typeof modelInfo.targetFormat === "string") {
    normalized.targetFormat = modelInfo.targetFormat;
  }
  if (typeof modelInfo.format === "string") {
    normalized.format = modelInfo.format;
  }

  return normalized;
}

export function shouldUseNativeResponsesPath(modelInfo: unknown): boolean {
  if (!isPlainRecord(modelInfo)) return false;
  return (
    modelInfo.targetFormat === FORMATS.OPENAI_RESPONSES ||
    modelInfo.format === FORMATS.OPENAI_RESPONSES ||
    modelInfo.apiFormat === "responses" ||
    modelInfo.provider === "codex"
  );
}

function createResponsesClientRawRequest(body: Record<string, unknown>) {
  return {
    endpoint: "/v1/responses",
    body,
    headers: new Headers({
      accept: body.stream === false ? "application/json" : "text/event-stream",
    }),
  };
}

/**
 * Handle /v1/responses request
 * @param {object} options
 * @param {object} options.body - Request body (Responses API format)
 * @param {object} options.modelInfo - { provider, model }
 * @param {object} options.credentials - Provider credentials
 * @param {object} options.log - Logger instance (optional)
 * @param {function} options.onCredentialsRefreshed - Callback when credentials are refreshed
 * @param {function} options.onRequestSuccess - Callback when request succeeds
 * @param {function} options.onDisconnect - Callback when client disconnects
 * @param {string} options.connectionId - Connection ID for usage tracking
 * @returns {Promise<{success: boolean, response?: Response, status?: number, error?: string}>}
 */
export async function handleResponsesCore({
  body,
  modelInfo,
  credentials,
  log,
  onCredentialsRefreshed,
  onRequestSuccess,
  onDisconnect,
  connectionId,
}) {
  if (shouldUseNativeResponsesPath(modelInfo)) {
    const bodyRecord = isPlainRecord(body) ? body : null;
    const nativeModelInfo = toResponsesModelInfo(modelInfo);
    if (!bodyRecord) {
      return {
        success: false,
        status: 400,
        error: "Invalid Responses API payload: request body must be a plain object",
        response: new Response(
          JSON.stringify({
            error: {
              message: "Invalid Responses API payload: request body must be a plain object",
              type: "invalid_request_error",
              code: "invalid_responses_payload",
            },
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        ),
      };
    }
    if (!nativeModelInfo) {
      return {
        success: false,
        status: 400,
        error: "Invalid modelInfo for native Responses path: provider and model are required",
        response: new Response(
          JSON.stringify({
            error: {
              message:
                "Invalid modelInfo for native Responses path: provider and model are required",
              type: "invalid_request_error",
              code: "invalid_native_responses_model_info",
            },
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        ),
      };
    }

    return await handleChatCore({
      body: bodyRecord,
      modelInfo: {
        ...nativeModelInfo,
        targetFormat: FORMATS.OPENAI_RESPONSES,
        sourceFormat: FORMATS.OPENAI_RESPONSES,
      },
      credentials,
      log,
      onCredentialsRefreshed,
      onRequestSuccess,
      onDisconnect,
      clientRawRequest: createResponsesClientRawRequest(bodyRecord),
      connectionId,
      userAgent: null,
      comboName: null,
    });
  }

  // Convert Responses API format to Chat Completions format
  const convertedBody = convertResponsesApiFormat(body);
  const convertedBodyRecord = isPlainRecord(convertedBody) ? convertedBody : null;

  if (!convertedBodyRecord) {
    return {
      success: false,
      status: 400,
      error: "Invalid translated payload: Responses API conversion must return a plain object",
      response: new Response(
        JSON.stringify({
          error: {
            message:
              "Invalid translated payload: Responses API conversion must return a plain object",
            type: "invalid_request_error",
            code: "invalid_translated_payload",
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      ),
    };
  }

  // Ensure stream is enabled
  convertedBodyRecord.stream = true;

  // Call chat core handler
  const result = await handleChatCore({
    body: convertedBodyRecord,
    modelInfo,
    credentials,
    log,
    onCredentialsRefreshed,
    onRequestSuccess,
    onDisconnect,
    clientRawRequest: null,
    connectionId,
    userAgent: null,
    comboName: null,
  });

  if (!result.success || !result.response) {
    return result;
  }

  const response = result.response;
  const contentType = response.headers.get("Content-Type") || "";

  // If not SSE or error, return as-is
  if (!contentType.includes("text/event-stream") || response.status !== 200) {
    return result;
  }

  // Transform SSE stream to Responses API format (no logging in worker)
  const transformStream = createResponsesApiTransformStream(null);
  const transformedBody = response.body.pipeThrough(transformStream);

  return {
    success: true,
    response: new Response(transformedBody, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": getCorsOrigin(),
      },
    }),
  };
}
