import { getImageProvider, parseImageModel } from "../../config/imageRegistry.ts";
import {
  normalizeRequestedImageCount,
  createSingleImageBody,
  createImageFanoutError,
  runWithConcurrency,
  saveImageCallLog,
} from "./shared.ts";
import { dispatchImageGeneration } from "./dispatch.ts";
/**
 * Handle image generation request
 * @param {object} options
 * @param {object} options.body - Request body
 * @param {object} options.credentials - Provider credentials { apiKey, accessToken }
 * @param {object} options.log - Logger
 * @param {string} [options.resolvedProvider] - Pre-resolved provider ID (from route layer custom model resolution)
 */
export async function handleImageGeneration({ body, credentials, log, resolvedProvider = null }) {
  let provider, model;

  if (resolvedProvider) {
    // Provider was already resolved by the route layer (custom model from DB)
    // Extract model name from the full "provider/model" string
    provider = resolvedProvider;
    const modelStr = body.model || "";
    model = modelStr.startsWith(provider + "/") ? modelStr.slice(provider.length + 1) : modelStr;
  } else {
    // Standard path: resolve from built-in image registry
    const parsed = parseImageModel(body.model);
    provider = parsed.provider;
    model = parsed.model;
  }

  if (!provider) {
    return {
      success: false,
      status: 400,
      error: `Invalid image model: ${body.model}. Use format: provider/model`,
    };
  }

  const providerConfig = getImageProvider(provider);

  // For custom models without a built-in provider config, use OpenAI-compatible handler
  // with a synthetic config based on the provider's credentials
  if (!providerConfig) {
    if (!resolvedProvider) {
      return {
        success: false,
        status: 400,
        error: `Unknown image provider: ${provider}`,
      };
    }

    // Custom model: use OpenAI-compatible format with provider's base URL
    // The credentials were already resolved by the route layer
    if (log) {
      log.info("IMAGE", `Custom model ${provider}/${model} — using OpenAI-compatible handler`);
    }

    const syntheticConfig = {
      id: provider,
      baseUrl:
        credentials?.baseUrl ||
        `https://generativelanguage.googleapis.com/v1beta/openai/images/generations`,
      authType: "apikey",
      authHeader: "bearer",
      format: "openai",
    };

    return dispatchImageGeneration({
      model,
      provider,
      providerConfig: syntheticConfig,
      body,
      credentials,
      log,
    });
  }

  const requestedN = normalizeRequestedImageCount(body.n);
  if (requestedN > 1) {
    const maxNativeN = Number.isFinite(providerConfig.maxNativeN)
      ? Number(providerConfig.maxNativeN)
      : Infinity;
    if (providerConfig.supportsNativeN === true && requestedN <= maxNativeN) {
      return dispatchImageGeneration({
        model,
        provider,
        providerConfig,
        body: { ...body, n: requestedN },
        credentials,
        log,
      });
    }

    if (providerConfig.supportsParallelFanout === true) {
      return handleParallelImageGeneration({
        provider,
        model,
        providerConfig,
        body: { ...body, n: requestedN },
        credentials,
        log,
      });
    }

    return {
      success: false,
      status: 400,
      error: `${provider} does not support n > 1 image generation for model ${model}`,
    };
  }

  return dispatchImageGeneration({ model, provider, providerConfig, body, credentials, log });
}
export async function handleParallelImageGeneration({
  provider,
  model,
  providerConfig,
  body,
  credentials,
  log,
}) {
  const requestedN = normalizeRequestedImageCount(body.n);
  const concurrency = Math.max(
    1,
    Math.min(
      requestedN,
      Number.isFinite(providerConfig.fanoutDefaultConcurrency)
        ? Number(providerConfig.fanoutDefaultConcurrency)
        : 2
    )
  );
  const startTime = Date.now();
  const logRequestBody = {
    model: body.model,
    prompt:
      typeof body.prompt === "string"
        ? body.prompt.slice(0, 200)
        : String(body.prompt ?? "").slice(0, 200),
    size: body.size || "default",
    n: requestedN,
    quality: body.quality || undefined,
  };

  const tasks = Array.from({ length: requestedN }, () => {
    const childBody = createSingleImageBody(body);
    return () =>
      dispatchImageGeneration({
        model,
        provider,
        providerConfig,
        body: childBody,
        credentials,
        log,
        callLog: false,
      });
  });

  const results = await runWithConcurrency(tasks, concurrency);
  const firstFailure = results.find((result) => !result?.success);

  if (firstFailure) {
    const delivered = results.filter((result) => result?.success).length;
    const errorResult = createImageFanoutError(
      provider,
      delivered,
      requestedN,
      firstFailure.error || "Unknown image provider error"
    );

    await saveImageCallLog({
      provider,
      model,
      status: firstFailure.status || errorResult.status,
      duration: Date.now() - startTime,
      requestBody: logRequestBody,
      error: errorResult.error,
      metadata: {
        mode: "fanout",
        requested_n: requestedN,
        delivered_n: delivered,
      },
    });

    return errorResult;
  }

  const aggregatedImages = results.flatMap((result) => result?.data?.data || []);
  const created =
    results.find((result) => Number.isFinite(result?.data?.created))?.data?.created ||
    Math.floor(Date.now() / 1000);

  await saveImageCallLog({
    provider,
    model,
    status: 200,
    duration: Date.now() - startTime,
    requestBody: logRequestBody,
    responseImagesCount: aggregatedImages.length,
    metadata: {
      mode: "fanout",
      requested_n: requestedN,
      delivered_n: aggregatedImages.length,
      concurrency,
    },
  });

  return {
    success: true,
    data: {
      created,
      data: aggregatedImages,
    },
  };
}
