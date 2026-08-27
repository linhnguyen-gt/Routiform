import { randomUUID } from "crypto";
import {
  submitComfyWorkflow,
  pollComfyResult,
  fetchComfyOutput,
  extractComfyOutputFiles,
} from "../../utils/comfyuiClient.ts";
import { saveCallLog } from "@/lib/usageDb";
import {
  IMAGE_SUBMIT_TIMEOUT_MS,
  IMAGE_DOWNLOAD_TIMEOUT_MS,
  LOCAL_IMAGE_TIMEOUT_MS,
  imageProviderErrorResponse,
} from "./shared.ts";
/**
 * Handle ComfyUI image generation (local, no auth)
 * Submits a txt2img workflow, polls for completion, fetches output
 */
export async function handleComfyUIImageGeneration({ model, provider, providerConfig, body, log }) {
  const startTime = Date.now();
  const [width, height] = (body.size || "1024x1024").split("x").map(Number);

  // Default txt2img workflow template for ComfyUI
  const workflow = {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: parseInt(randomUUID().replace(/-/g, "").substring(0, 8), 16) % 2 ** 32,
        steps: body.steps || 20,
        cfg: body.cfg_scale || 7,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: model },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: { width: width || 1024, height: height || 1024, batch_size: body.n || 1 },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: body.prompt, clip: ["4", 1] },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: body.negative_prompt || "", clip: ["4", 1] },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: { samples: ["3", 0], vae: ["4", 2] },
    },
    "9": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "routiform", images: ["8", 0] },
    },
  };

  if (log) {
    const promptPreview = String(body.prompt ?? "").slice(0, 60);
    log.info("IMAGE", `${provider}/${model} (comfyui) | prompt: "${promptPreview}..."`);
  }

  try {
    const promptId = await submitComfyWorkflow(
      providerConfig.baseUrl,
      workflow,
      AbortSignal.timeout(IMAGE_SUBMIT_TIMEOUT_MS)
    );
    const historyEntry = await pollComfyResult(
      providerConfig.baseUrl,
      promptId,
      120_000,
      AbortSignal.timeout(LOCAL_IMAGE_TIMEOUT_MS)
    );
    const outputFiles = extractComfyOutputFiles(historyEntry);

    const images = [];
    for (const file of outputFiles) {
      const buffer = await fetchComfyOutput(
        providerConfig.baseUrl,
        file.filename,
        file.subfolder,
        file.type,
        AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS)
      );
      const base64 = Buffer.from(buffer).toString("base64");
      images.push({ b64_json: base64, revised_prompt: body.prompt });
    }

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
    if (log) log.error("IMAGE", `${provider} comfyui error: ${err.message}`);
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
