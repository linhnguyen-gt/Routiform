/**
 * Google Vertex AI provider.
 */

import { CONTEXT_CONFIG } from "../../../src/shared/constants/context";
import type { RegistryEntry } from "../registry-types.ts";

export const VERTEX_PROVIDERS: Record<string, RegistryEntry> = {
  vertex: {
    id: "vertex",
    alias: "vertex",
    // Vertex AI uses Google's generateContent format (same as Gemini)
    format: "gemini",
    executor: "vertex",
    // URL uses {project_id} and {region} from providerSpecificData — handled by custom executor or fallback
    // Default to us-central1 / generic endpoint; users configure project via providerSpecificData
    baseUrl: "https://us-central1-aiplatform.googleapis.com/v1/projects",
    urlBuilder: (base, model, stream) => {
      // Full URL: {base}/{project}/locations/{region}/publishers/google/models/{model}:{action}
      // For a generic fallback, we build a Gemini-compatible URL
      // The actual project/region are configured via providerSpecificData in the DB connection
      const action = stream ? "streamGenerateContent?alt=sse" : "generateContent";
      return `https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}`;
    },
    authType: "apikey",
    authHeader: "bearer",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    models: [
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview (Vertex)" },
      // gemini-3.1-flash-lite-preview was shut down 2026-05-25 — replaced by
      // its non-preview successor. gemini-2.0-flash-thinking-exp is gone with
      // the rest of the 2.0 line (shut down 2026-06-01) and has no successor:
      // thinking is a first-class capability on 2.5+, not a separate model.
      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite (Vertex)" },
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview (Vertex)" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro (Vertex)" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (Vertex)" },
      { id: "gemma-2-27b-it", name: "Gemma 2 27B (Vertex)" },
      { id: "deepseek-v3.2", name: "DeepSeek V3.2 (Vertex Partner)" },
      { id: "qwen3-next-80b", name: "Qwen3 Next 80B (Vertex Partner)" },
      { id: "glm-5", name: "GLM-5 (Vertex Partner)" },
      { id: "claude-opus-4-5@20251101", name: "Claude Opus 4.5 (Vertex)" },
      { id: "claude-sonnet-4-5@20251101", name: "Claude Sonnet 4.5 (Vertex)" },
    ],
  },
};
