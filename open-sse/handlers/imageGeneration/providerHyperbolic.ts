import { saveCallLog } from "@/lib/usageDb";
import { LOCAL_IMAGE_TIMEOUT_MS, imageProviderErrorResponse } from "./shared.ts";
/**
 * Handle Hyperbolic image generation
 * Uses { model_name, prompt, height, width } and returns { images: [{ image: base64 }] }
 */
export async function handleHyperbolicImageGeneration({
  model,
  provider,
  providerConfig,
  body,
  credentials,
  log,
  callLog = true,
}) {
  const startTime = Date.now();
  const token = credentials.apiKey || credentials.accessToken;

  const [width, height] = (body.size || "1024x1024").split("x").map(Number);

  const upstreamBody = {
    model_name: model,
    prompt: body.prompt,
    height: height || 1024,
    width: width || 1024,
    backend: "auto",
  };

  if (log) {
    const promptPreview = String(body.prompt ?? "").slice(0, 60);
    log.info("IMAGE", `${provider}/${model} (hyperbolic) | prompt: "${promptPreview}..."`);
  }

  try {
    const response = await fetch(providerConfig.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(LOCAL_IMAGE_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (log)
        log.error("IMAGE", `${provider} error ${response.status}: ${errorText.slice(0, 200)}`);

      if (callLog) {
        saveCallLog({
          method: "POST",
          path: "/v1/images/generations",
          status: response.status,
          model: `${provider}/${model}`,
          provider,
          duration: Date.now() - startTime,
          error: errorText.slice(0, 500),
        }).catch(() => {});
      }

      return imageProviderErrorResponse(provider, response.status);
    }

    const data = await response.json();
    // Transform { images: [{ image: base64 }] } → OpenAI format
    const images = (data.images || []).map((img) => ({
      b64_json: img.image,
      revised_prompt: body.prompt,
    }));

    if (callLog) {
      saveCallLog({
        method: "POST",
        path: "/v1/images/generations",
        status: 200,
        model: `${provider}/${model}`,
        provider,
        duration: Date.now() - startTime,
        responseBody: { images_count: images.length },
      }).catch(() => {});
    }

    return {
      success: true,
      data: { created: Math.floor(Date.now() / 1000), data: images },
    };
  } catch (err) {
    if (log) log.error("IMAGE", `${provider} fetch error: ${err.message}`);
    if (callLog) {
      saveCallLog({
        method: "POST",
        path: "/v1/images/generations",
        status: 502,
        model: `${provider}/${model}`,
        provider,
        duration: Date.now() - startTime,
        error: err.message,
      }).catch(() => {});
    }
    return imageProviderErrorResponse(provider, 502);
  }
}
