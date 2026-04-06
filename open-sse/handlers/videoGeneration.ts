/**
 * Video Generation Handler
 *
 * Handles POST /v1/videos/generations requests.
 * Proxies to upstream video generation providers.
 *
 * Supported provider formats:
 * - ComfyUI: submit AnimateDiff/SVD workflow → poll → fetch video
 * - SD WebUI: POST to AnimateDiff extension endpoint
 *
 * Response format (OpenAI-like):
 * {
 *   "created": 1234567890,
 *   "data": [{ "b64_json": "...", "format": "mp4" }]
 * }
 */

import { getVideoProvider, parseVideoModel } from "../config/videoRegistry.ts";
import {
  submitComfyWorkflow,
  pollComfyResult,
  fetchComfyOutput,
  extractComfyOutputFiles,
} from "../utils/comfyuiClient.ts";
import { saveCallLog } from "@/lib/usageDb";

/**
 * Handle video generation request
 */
export async function handleVideoGeneration({ body, credentials, log }) {
  const { provider, model } = parseVideoModel(body.model);

  if (!provider) {
    return {
      success: false,
      status: 400,
      error: `Invalid video model: ${body.model}. Use format: provider/model`,
    };
  }

  const providerConfig = getVideoProvider(provider);
  if (!providerConfig) {
    return {
      success: false,
      status: 400,
      error: `Unknown video provider: ${provider}`,
    };
  }

  if (providerConfig.format === "comfyui") {
    return handleComfyUIVideoGeneration({ model, provider, providerConfig, body, log });
  }

  if (providerConfig.format === "sdwebui-video") {
    return handleSDWebUIVideoGeneration({ model, provider, providerConfig, body, log });
  }

  if (providerConfig.format === "gemini-veo") {
    return handleGeminiVeoVideoGeneration({
      model,
      provider,
      providerConfig,
      body,
      credentials,
      log,
    });
  }

  return {
    success: false,
    status: 400,
    error: `Unsupported video format: ${providerConfig.format}`,
  };
}

const GEMINI_VEO_POLL_MS = 5000;
const GEMINI_VEO_MAX_POLLS = 120; // ~10 min

function geminiOperationPollUrl(operationName: string): string {
  if (operationName.startsWith("http")) return operationName;
  const base = "https://generativelanguage.googleapis.com/v1beta";
  const clean = operationName.replace(/^\/+/, "");
  if (clean.startsWith("v1beta/")) {
    return `https://generativelanguage.googleapis.com/${clean}`;
  }
  return `${base}/${clean}`;
}

/**
 * Gemini API (Google AI Studio) — Veo text-to-video via predictLongRunning + long-running operation poll.
 * @see https://ai.google.dev/gemini-api/docs/video
 */
async function handleGeminiVeoVideoGeneration({
  model,
  provider,
  providerConfig,
  body,
  credentials,
  log,
}) {
  const startTime = Date.now();
  const apiKey = credentials?.apiKey;
  const accessToken = credentials?.accessToken;
  if (!apiKey && !accessToken) {
    return {
      success: false,
      status: 401,
      error:
        "Missing Gemini API key or OAuth token. Add a Gemini (Google AI Studio) connection in Providers.",
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["x-goog-api-key"] = apiKey;
  } else {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return { success: false, status: 400, error: "Missing prompt" };
  }

  const predictUrl = `${providerConfig.baseUrl}/models/${encodeURIComponent(model)}:predictLongRunning`;
  const payload: Record<string, unknown> = {
    instances: [{ prompt }],
  };

  if (log) {
    log.info("VIDEO", `${provider}/${model} (gemini-veo) | prompt: "${prompt.slice(0, 60)}..."`);
  }

  try {
    const startRes = await fetch(predictUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const startText = await startRes.text();
    let startJson: Record<string, unknown>;
    try {
      startJson = JSON.parse(startText) as Record<string, unknown>;
    } catch {
      return {
        success: false,
        status: startRes.status,
        error: `Gemini Veo error: ${startText.slice(0, 300)}`,
      };
    }

    if (!startRes.ok) {
      return {
        success: false,
        status: startRes.status,
        error:
          (startJson.error as { message?: string })?.message ||
          startText.slice(0, 500) ||
          "Gemini Veo predictLongRunning failed",
      };
    }

    const opName = startJson.name as string | undefined;
    if (!opName) {
      return {
        success: false,
        status: 502,
        error: "Gemini Veo: missing operation name in response",
      };
    }

    const pollUrl = geminiOperationPollUrl(opName);

    for (let i = 0; i < GEMINI_VEO_MAX_POLLS; i++) {
      const pollRes = await fetch(pollUrl, { headers });
      const pollText = await pollRes.text();
      let pollJson: Record<string, unknown>;
      try {
        pollJson = JSON.parse(pollText) as Record<string, unknown>;
      } catch {
        return {
          success: false,
          status: 502,
          error: `Gemini Veo poll: invalid JSON (${pollRes.status})`,
        };
      }

      if (!pollRes.ok) {
        return {
          success: false,
          status: pollRes.status,
          error: (pollJson.error as { message?: string })?.message || pollText.slice(0, 400),
        };
      }

      if (pollJson.error) {
        const err = pollJson.error as { message?: string; code?: number };
        return {
          success: false,
          status: typeof err.code === "number" ? err.code : 502,
          error: err.message || "Gemini Veo operation error",
        };
      }

      if (pollJson.done === true) {
        const response = pollJson.response as Record<string, unknown> | undefined;
        const genVideo = response?.generateVideoResponse as Record<string, unknown> | undefined;
        const samples = genVideo?.generatedSamples as unknown[] | undefined;
        const first = samples?.[0] as Record<string, unknown> | undefined;
        const video = first?.video as Record<string, unknown> | undefined;
        let videoUri = typeof video?.uri === "string" ? video.uri : null;

        if (!videoUri) {
          const alt = response?.generatedVideos as unknown[] | undefined;
          const v0 = alt?.[0] as Record<string, unknown> | undefined;
          const file = v0?.video as Record<string, unknown> | undefined;
          if (typeof file?.uri === "string") videoUri = file.uri;
        }

        if (!videoUri) {
          return {
            success: false,
            status: 502,
            error: "Gemini Veo: completed but no video URI in response",
          };
        }

        const videoRes = await fetch(videoUri, { headers });
        if (!videoRes.ok) {
          const errT = await videoRes.text();
          return {
            success: false,
            status: videoRes.status,
            error: `Failed to download video: ${errT.slice(0, 200)}`,
          };
        }
        const buf = Buffer.from(await videoRes.arrayBuffer());
        const b64 = buf.toString("base64");

        saveCallLog({
          method: "POST",
          path: "/v1/videos/generations",
          status: 200,
          model: `${provider}/${model}`,
          provider,
          duration: Date.now() - startTime,
          responseBody: { format: "mp4" },
        }).catch(() => {});

        return {
          success: true,
          data: {
            created: Math.floor(Date.now() / 1000),
            data: [{ b64_json: b64, format: "mp4" }],
          },
        };
      }

      await new Promise((r) => setTimeout(r, GEMINI_VEO_POLL_MS));
    }

    return {
      success: false,
      status: 504,
      error: "Gemini Veo: generation timed out (still processing)",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (log) log.error("VIDEO", `gemini veo error: ${msg}`);
    saveCallLog({
      method: "POST",
      path: "/v1/videos/generations",
      status: 502,
      model: `${provider}/${model}`,
      provider,
      duration: Date.now() - startTime,
      error: msg,
    }).catch(() => {});
    return { success: false, status: 502, error: `Video provider error: ${msg}` };
  }
}

/**
 * Handle ComfyUI video generation
 * Submits an AnimateDiff or SVD workflow, polls for completion, fetches output video
 */
async function handleComfyUIVideoGeneration({ model, provider, providerConfig, body, log }) {
  const startTime = Date.now();
  const [width, height] = (body.size || "512x512").split("x").map(Number);
  const frames = body.frames || 16;

  // AnimateDiff workflow template
  const workflow = {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: model },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: body.prompt, clip: ["1", 1] },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: body.negative_prompt || "", clip: ["1", 1] },
    },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width: width || 512, height: height || 512, batch_size: frames },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        seed: Math.floor(Math.random() * 2 ** 32),
        steps: body.steps || 20,
        cfg: body.cfg_scale || 7,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
      },
    },
    "6": {
      class_type: "VAEDecode",
      inputs: { samples: ["5", 0], vae: ["1", 2] },
    },
    "7": {
      class_type: "SaveAnimatedWEBP",
      inputs: {
        filename_prefix: "routiform_video",
        fps: body.fps || 8,
        lossless: false,
        quality: 80,
        method: "default",
        images: ["6", 0],
      },
    },
  };

  if (log) {
    const promptPreview = String(body.prompt ?? "").slice(0, 60);
    log.info(
      "VIDEO",
      `${provider}/${model} (comfyui) | prompt: "${promptPreview}..." | frames: ${frames}`
    );
  }

  try {
    const promptId = await submitComfyWorkflow(providerConfig.baseUrl, workflow);
    const historyEntry = await pollComfyResult(providerConfig.baseUrl, promptId, 300_000);
    const outputFiles = extractComfyOutputFiles(historyEntry);

    const videos = [];
    for (const file of outputFiles) {
      const buffer = await fetchComfyOutput(
        providerConfig.baseUrl,
        file.filename,
        file.subfolder,
        file.type
      );
      const base64 = Buffer.from(buffer).toString("base64");
      videos.push({ b64_json: base64, format: "webp" });
    }

    saveCallLog({
      method: "POST",
      path: "/v1/videos/generations",
      status: 200,
      model: `${provider}/${model}`,
      provider,
      duration: Date.now() - startTime,
      responseBody: { videos_count: videos.length },
    }).catch(() => {});

    return {
      success: true,
      data: { created: Math.floor(Date.now() / 1000), data: videos },
    };
  } catch (err) {
    if (log) log.error("VIDEO", `${provider} comfyui error: ${err.message}`);
    saveCallLog({
      method: "POST",
      path: "/v1/videos/generations",
      status: 502,
      model: `${provider}/${model}`,
      provider,
      duration: Date.now() - startTime,
      error: err.message,
    }).catch(() => {});
    return { success: false, status: 502, error: `Video provider error: ${err.message}` };
  }
}

/**
 * Handle SD WebUI video generation via AnimateDiff extension
 * POST to the AnimateDiff API endpoint
 */
async function handleSDWebUIVideoGeneration({ model, provider, providerConfig, body, log }) {
  const startTime = Date.now();
  const [width, height] = (body.size || "512x512").split("x").map(Number);
  const url = `${providerConfig.baseUrl}/animatediff/v1/generate`;

  const upstreamBody = {
    prompt: body.prompt,
    negative_prompt: body.negative_prompt || "",
    width: width || 512,
    height: height || 512,
    steps: body.steps || 20,
    cfg_scale: body.cfg_scale || 7,
    frames: body.frames || 16,
    fps: body.fps || 8,
  };

  if (log) {
    const promptPreview = String(body.prompt ?? "").slice(0, 60);
    log.info("VIDEO", `${provider}/${model} (sdwebui) | prompt: "${promptPreview}..."`);
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(upstreamBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (log)
        log.error("VIDEO", `${provider} error ${response.status}: ${errorText.slice(0, 200)}`);
      saveCallLog({
        method: "POST",
        path: "/v1/videos/generations",
        status: response.status,
        model: `${provider}/${model}`,
        provider,
        duration: Date.now() - startTime,
        error: errorText.slice(0, 500),
      }).catch(() => {});
      return { success: false, status: response.status, error: errorText };
    }

    const data = await response.json();
    // SD WebUI AnimateDiff returns { video: "base64..." } or { images: [...] }
    const videos = [];
    if (data.video) {
      videos.push({ b64_json: data.video, format: "mp4" });
    } else if (data.images) {
      for (const img of data.images) {
        videos.push({ b64_json: typeof img === "string" ? img : img.image, format: "mp4" });
      }
    }

    saveCallLog({
      method: "POST",
      path: "/v1/videos/generations",
      status: 200,
      model: `${provider}/${model}`,
      provider,
      duration: Date.now() - startTime,
      responseBody: { videos_count: videos.length },
    }).catch(() => {});

    return {
      success: true,
      data: { created: Math.floor(Date.now() / 1000), data: videos },
    };
  } catch (err) {
    if (log) log.error("VIDEO", `${provider} sdwebui error: ${err.message}`);
    saveCallLog({
      method: "POST",
      path: "/v1/videos/generations",
      status: 502,
      model: `${provider}/${model}`,
      provider,
      duration: Date.now() - startTime,
      error: err.message,
    }).catch(() => {});
    return { success: false, status: 502, error: `Video provider error: ${err.message}` };
  }
}
