import { saveCallLog } from "@/lib/usageDb";
import { IMAGE_SUBMIT_TIMEOUT_MS, imageProviderErrorResponse } from "./shared.ts";
/**
 * Handle OpenAI-compatible image generation (standard providers + Nebius fallback)
 */
export async function handleOpenAIImageGeneration({
  model,
  provider,
  providerConfig,
  body,
  credentials,
  log,
  callLog = true,
}) {
  const startTime = Date.now();

  // Summarized request for call log
  const logRequestBody = {
    model: body.model,
    prompt:
      typeof body.prompt === "string"
        ? body.prompt.slice(0, 200)
        : String(body.prompt ?? "").slice(0, 200),
    size: body.size || "default",
    n: body.n || 1,
    quality: body.quality || undefined,
  };

  // Build upstream request (OpenAI-compatible format)
  const upstreamBody: Record<string, unknown> = {
    model: model,
    prompt: body.prompt,
  };

  // Pass optional parameters
  if (body.n !== undefined) upstreamBody.n = body.n;
  if (body.size !== undefined) upstreamBody.size = body.size;
  if (body.quality !== undefined) upstreamBody.quality = body.quality;
  if (body.response_format !== undefined) upstreamBody.response_format = body.response_format;
  if (body.style !== undefined) upstreamBody.style = body.style;

  // Build headers
  const headers = {
    "Content-Type": "application/json",
  };

  const token = credentials.apiKey || credentials.accessToken;
  if (providerConfig.authHeader === "bearer") {
    headers["Authorization"] = `Bearer ${token}`;
  } else if (providerConfig.authHeader === "x-api-key") {
    headers["x-api-key"] = token;
  }

  if (log) {
    const promptPreview =
      typeof body.prompt === "string"
        ? body.prompt.slice(0, 60)
        : String(body.prompt ?? "").slice(0, 60);
    log.info(
      "IMAGE",
      `${provider}/${model} | prompt: "${promptPreview}..." | size: ${body.size || "default"}`
    );
  }

  const requestBody = JSON.stringify(upstreamBody);

  // Try primary URL
  let result = await fetchImageEndpoint(
    providerConfig.baseUrl,
    headers,
    requestBody,
    provider,
    log
  );

  // Fallback for providers with fallbackUrl (e.g., Nebius)
  if (
    !result.success &&
    providerConfig.fallbackUrl &&
    [404, 410, 502, 503].includes(result.status)
  ) {
    if (log) {
      log.info("IMAGE", `${provider}: primary URL failed (${result.status}), trying fallback...`);
    }
    result = await fetchImageEndpoint(
      providerConfig.fallbackUrl,
      headers,
      requestBody,
      provider,
      log
    );
  }

  // Save call log after result is determined
  if (callLog) {
    saveCallLog({
      method: "POST",
      path: "/v1/images/generations",
      status: result.status || (result.success ? 200 : 502),
      model: `${provider}/${model}`,
      provider,
      duration: Date.now() - startTime,
      tokens: { prompt_tokens: 0, completion_tokens: 0 },
      error: result.success
        ? null
        : typeof result.error === "string"
          ? result.error.slice(0, 500)
          : null,
      requestBody: logRequestBody,
      responseBody: result.success ? { images_count: result.data?.data?.length || 0 } : null,
    }).catch(() => {});
  }

  // Sanitize the client-visible error; fetchImageEndpoint's raw error text was
  // already persisted server-side via the saveCallLog above.
  if (!result.success) {
    return imageProviderErrorResponse(provider, result.status || 502);
  }

  return result;
}
/**
 * Fetch a single image endpoint and normalize response
 */
export async function fetchImageEndpoint(url, headers, body, provider, log) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(IMAGE_SUBMIT_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (log) {
        log.error("IMAGE", `${provider} error ${response.status}: ${errorText.slice(0, 200)}`);
      }
      return {
        success: false,
        status: response.status,
        error: errorText,
      };
    }

    const data = await response.json();

    // Normalize response to OpenAI format
    return {
      success: true,
      data: {
        created: data.created || Math.floor(Date.now() / 1000),
        data: data.data || [],
      },
    };
  } catch (err) {
    if (log) {
      log.error("IMAGE", `${provider} fetch error: ${err.message}`);
    }
    return {
      success: false,
      status: 502,
      error: `Image provider error: ${err.message}`,
    };
  }
}
