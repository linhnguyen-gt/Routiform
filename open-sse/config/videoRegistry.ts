/**
 * Video Generation Provider Registry
 *
 * Defines providers that support the /v1/videos/generations endpoint.
 * - Gemini (Google AI Studio): Veo via predictLongRunning + operations poll
 * - Local: ComfyUI, SD WebUI (AnimateDiff)
 */

import { parseModelFromRegistry, getAllModelsFromRegistry } from "./registryUtils.ts";

interface VideoModel {
  id: string;
  name: string;
}

interface VideoProvider {
  id: string;
  baseUrl: string;
  authType: string;
  authHeader: string;
  format: string;
  models: VideoModel[];
}

export const VIDEO_PROVIDERS: Record<string, VideoProvider> = {
  /** Google AI Studio / Gemini API — Veo models (see ai.google.dev/gemini-api/docs/video) */
  gemini: {
    id: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    authType: "apikey",
    authHeader: "x-goog-api-key",
    format: "gemini-veo",
    models: [
      { id: "veo-2.0-generate-001", name: "Veo 2.0" },
      { id: "veo-3.0-generate-001", name: "Veo 3.0" },
      { id: "veo-3.0-fast-generate-001", name: "Veo 3.0 Fast" },
      { id: "veo-3.1-generate-preview", name: "Veo 3.1 (preview)" },
      { id: "veo-3.1-fast-generate-preview", name: "Veo 3.1 Fast (preview)" },
      { id: "veo-3.1-lite-generate-preview", name: "Veo 3.1 Lite (preview)" },
    ],
  },

  comfyui: {
    id: "comfyui",
    baseUrl: "http://localhost:8188",
    authType: "none",
    authHeader: "none",
    format: "comfyui",
    models: [
      { id: "animatediff", name: "AnimateDiff" },
      { id: "svd-xt", name: "Stable Video Diffusion XT" },
    ],
  },

  sdwebui: {
    id: "sdwebui",
    baseUrl: "http://localhost:7860",
    authType: "none",
    authHeader: "none",
    format: "sdwebui-video",
    models: [{ id: "animatediff-webui", name: "AnimateDiff (WebUI)" }],
  },
};

/**
 * Get video provider config by ID
 */
export function getVideoProvider(providerId: string): VideoProvider | null {
  return VIDEO_PROVIDERS[providerId] || null;
}

/**
 * Parse video model string (format: "provider/model" or just "model")
 */
export function parseVideoModel(modelStr: string | null) {
  return parseModelFromRegistry(modelStr, VIDEO_PROVIDERS);
}

/**
 * Get all video models as a flat list
 */
export function getAllVideoModels() {
  return getAllModelsFromRegistry(VIDEO_PROVIDERS);
}
