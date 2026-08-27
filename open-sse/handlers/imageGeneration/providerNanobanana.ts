import { mapImageSize } from "../../translator/image/sizeMapper.ts";
import { saveCallLog } from "@/lib/usageDb";
import {
  IMAGE_SUBMIT_TIMEOUT_MS,
  IMAGE_POLL_FETCH_TIMEOUT_MS,
  imageProviderErrorResponse,
  normalizePositiveNumber,
  sleep,
} from "./shared.ts";
import {
  normalizeNanoBananaSyncPayload,
  normalizeNanoBananaTaskResult,
  inferResolutionFromSize,
} from "./nanobananaNormalize.ts";
/**
 * Handle NanoBanana image generation
 * NanoBanana is async (submit task -> poll status -> return final image URL/base64)
 */
export async function handleNanoBananaImageGeneration({
  model,
  provider,
  providerConfig,
  body,
  credentials,
  log,
}) {
  const startTime = Date.now();
  const token = credentials.apiKey || credentials.accessToken;

  // Route to pro URL for "nanobanana-pro" model
  const isPro = model === "nanobanana-pro";
  const submitUrl = isPro && providerConfig.proUrl ? providerConfig.proUrl : providerConfig.baseUrl;
  const statusUrl = providerConfig.statusUrl;

  const aspectRatio =
    typeof body.aspectRatio === "string"
      ? body.aspectRatio
      : typeof body.aspect_ratio === "string"
        ? body.aspect_ratio
        : mapImageSize(body.size);

  let resolution =
    typeof body.resolution === "string"
      ? body.resolution
      : inferResolutionFromSize(body.size) || "1K";
  if (body.quality === "hd" && resolution === "1K") {
    resolution = "2K";
  }

  const upstreamBody = isPro
    ? {
        prompt: body.prompt,
        resolution,
        aspectRatio,
        ...(Array.isArray(body.imageUrls) ? { imageUrls: body.imageUrls } : {}),
      }
    : {
        prompt: body.prompt,
        type:
          Array.isArray(body.imageUrls) && body.imageUrls.length > 0
            ? "IMAGETOIAMGE"
            : "TEXTTOIAMGE",
        numImages: Number.isFinite(body.n) ? Math.max(1, Number(body.n)) : 1,
        image_size: aspectRatio,
        ...(Array.isArray(body.imageUrls) ? { imageUrls: body.imageUrls } : {}),
      };

  if (log) {
    const promptPreview = String(body.prompt ?? "").slice(0, 60);
    log.info(
      "IMAGE",
      `${provider}/${model} (nanobanana ${isPro ? "pro" : "flash"}) | prompt: "${promptPreview}..."`
    );
  }

  try {
    const submitResp = await fetch(submitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(IMAGE_SUBMIT_TIMEOUT_MS),
    });

    if (!submitResp.ok) {
      const errorText = await submitResp.text();
      if (log) {
        log.error(
          "IMAGE",
          `${provider} submit error ${submitResp.status}: ${errorText.slice(0, 200)}`
        );
      }

      saveCallLog({
        method: "POST",
        path: "/v1/images/generations",
        status: submitResp.status,
        model: `${provider}/${model}`,
        provider,
        duration: Date.now() - startTime,
        error: errorText.slice(0, 500),
      }).catch(() => {});

      return imageProviderErrorResponse(provider, submitResp.status);
    }

    const submitData = await submitResp.json();

    // Backward compatibility: handle providers returning image payload synchronously
    const hasSyncPayload =
      Boolean(submitData?.image) ||
      Array.isArray(submitData?.images) ||
      Array.isArray(submitData?.data) ||
      Boolean(submitData?.data?.[0]?.url) ||
      Boolean(submitData?.data?.[0]?.b64_json);

    if (hasSyncPayload) {
      const syncResult = normalizeNanoBananaSyncPayload(submitData, body.prompt);
      saveCallLog({
        method: "POST",
        path: "/v1/images/generations",
        status: 200,
        model: `${provider}/${model}`,
        provider,
        duration: Date.now() - startTime,
        responseBody: { images_count: syncResult.data?.length || 0, mode: "sync" },
      }).catch(() => {});
      return {
        success: true,
        data: { created: Math.floor(Date.now() / 1000), data: syncResult.data },
      };
    }

    const taskId = submitData?.data?.taskId || submitData?.taskId;
    if (!taskId) {
      const errorText = `NanoBanana submit did not return taskId: ${JSON.stringify(submitData).slice(0, 400)}`;
      saveCallLog({
        method: "POST",
        path: "/v1/images/generations",
        status: 502,
        model: `${provider}/${model}`,
        provider,
        duration: Date.now() - startTime,
        error: errorText,
      }).catch(() => {});
      return imageProviderErrorResponse(provider, 502);
    }

    if (!statusUrl) {
      const errorText = "NanoBanana statusUrl is not configured";
      saveCallLog({
        method: "POST",
        path: "/v1/images/generations",
        status: 500,
        model: `${provider}/${model}`,
        provider,
        duration: Date.now() - startTime,
        error: errorText,
      }).catch(() => {});
      return { success: false, status: 500, error: errorText };
    }

    const timeoutMs = normalizePositiveNumber(
      body.timeout_ms,
      normalizePositiveNumber(process.env.NANOBANANA_POLL_TIMEOUT_MS, 120000)
    );
    const pollIntervalMs = normalizePositiveNumber(
      body.poll_interval_ms,
      normalizePositiveNumber(process.env.NANOBANANA_POLL_INTERVAL_MS, 2500)
    );

    let lastTaskData = null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const pollResp = await fetch(`${statusUrl}?taskId=${encodeURIComponent(taskId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(IMAGE_POLL_FETCH_TIMEOUT_MS),
      });

      if (!pollResp.ok) {
        const errorText = await pollResp.text();
        if (log) {
          log.error(
            "IMAGE",
            `${provider} poll error ${pollResp.status}: ${errorText.slice(0, 200)}`
          );
        }
        return imageProviderErrorResponse(provider, pollResp.status);
      }

      const pollData = await pollResp.json();
      const taskData = pollData?.data || pollData;
      lastTaskData = taskData;

      const successFlag = Number(taskData?.successFlag);
      if (successFlag === 1) {
        const normalized = await normalizeNanoBananaTaskResult(taskData, body, log);

        saveCallLog({
          method: "POST",
          path: "/v1/images/generations",
          status: 200,
          model: `${provider}/${model}`,
          provider,
          duration: Date.now() - startTime,
          responseBody: { images_count: normalized.length, mode: "async", taskId },
        }).catch(() => {});

        return {
          success: true,
          data: {
            created: Math.floor(Date.now() / 1000),
            data: normalized,
          },
        };
      }

      if (successFlag === 2 || successFlag === 3) {
        const errorText =
          taskData?.errorMessage || `NanoBanana task failed (successFlag=${String(successFlag)})`;

        saveCallLog({
          method: "POST",
          path: "/v1/images/generations",
          status: 502,
          model: `${provider}/${model}`,
          provider,
          duration: Date.now() - startTime,
          error: errorText.slice(0, 500),
          responseBody: { taskId, successFlag, errorCode: taskData?.errorCode ?? null },
        }).catch(() => {});

        return imageProviderErrorResponse(provider, 502);
      }

      await sleep(pollIntervalMs);
    }

    const timeoutError = `NanoBanana task timeout after ${timeoutMs}ms (taskId=${taskId}, successFlag=${String(lastTaskData?.successFlag ?? "unknown")})`;
    saveCallLog({
      method: "POST",
      path: "/v1/images/generations",
      status: 504,
      model: `${provider}/${model}`,
      provider,
      duration: Date.now() - startTime,
      error: timeoutError,
      responseBody: { taskId, lastSuccessFlag: lastTaskData?.successFlag ?? null },
    }).catch(() => {});

    return imageProviderErrorResponse(provider, 504);
  } catch (err) {
    if (log) log.error("IMAGE", `${provider} fetch error: ${err.message}`);
    saveCallLog({
      method: "POST",
      path: "/v1/images/generations",
      status: 502,
      model: `${provider}/${model}`,
      provider,
      duration: Date.now() - startTime,
      error: err.message,
    }).catch(() => {});
    return imageProviderErrorResponse(provider, 502);
  }
}
