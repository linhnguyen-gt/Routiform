import { saveCallLog } from "@/lib/usageDb";
import { LOCAL_IMAGE_TIMEOUT_MS, imageProviderErrorResponse } from "./shared.ts";
/**
 * Handle SD WebUI image generation (local, no auth)
 * POST {baseUrl} with { prompt, negative_prompt, width, height, steps }
 * Response: { images: ["base64..."] }
 */
export async function handleSDWebUIImageGeneration({ model, provider, providerConfig, body, log }) {
  const startTime = Date.now();
  const [width, height] = (body.size || "512x512").split("x").map(Number);

  const upstreamBody = {
    prompt: body.prompt,
    negative_prompt: body.negative_prompt || "",
    width: width || 512,
    height: height || 512,
    steps: body.steps || 20,
    cfg_scale: body.cfg_scale || 7,
    sampler_name: body.sampler || "Euler a",
    batch_size: body.n || 1,
    override_settings: {
      sd_model_checkpoint: model,
    },
  };

  if (log) {
    const promptPreview = String(body.prompt ?? "").slice(0, 60);
    log.info("IMAGE", `${provider}/${model} (sdwebui) | prompt: "${promptPreview}..."`);
  }

  try {
    const response = await fetch(providerConfig.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(LOCAL_IMAGE_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (log)
        log.error("IMAGE", `${provider} error ${response.status}: ${errorText.slice(0, 200)}`);

      saveCallLog({
        method: "POST",
        path: "/v1/images/generations",
        status: response.status,
        model: `${provider}/${model}`,
        provider,
        duration: Date.now() - startTime,
        error: errorText.slice(0, 500),
      }).catch(() => {});

      return imageProviderErrorResponse(provider, response.status);
    }

    const data = await response.json();
    // SD WebUI returns { images: ["base64...", ...] }
    const images = (data.images || []).map((b64) => ({
      b64_json: b64,
      revised_prompt: body.prompt,
    }));

    saveCallLog({
      method: "POST",
      path: "/v1/images/generations",
      status: 200,
      model: `${provider}/${model}`,
      provider,
      duration: Date.now() - startTime,
      responseBody: { images_count: images.length },
    }).catch(() => {});

    return {
      success: true,
      data: { created: Math.floor(Date.now() / 1000), data: images },
    };
  } catch (err) {
    if (log) log.error("IMAGE", `${provider} sdwebui error: ${err.message}`);
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
