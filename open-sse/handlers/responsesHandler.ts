import { getCorsOrigin } from "../utils/cors.ts";
/**
 * Responses API Handler for Workers
 * Converts Chat Completions to Codex Responses API format
 */

import { handleChatCore } from "./chatCore.ts";
import { convertResponsesApiFormat } from "../translator/helpers/responsesApiHelper.ts";
import { createResponsesApiTransformStream } from "../transformer/responsesTransformer.ts";

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
  // Convert Responses API format to Chat Completions format
  const convertedBody = convertResponsesApiFormat(body);
  const convertedBodyRecord =
    convertedBody && typeof convertedBody === "object" && !Array.isArray(convertedBody)
      ? (convertedBody as Record<string, unknown>)
      : null;

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
