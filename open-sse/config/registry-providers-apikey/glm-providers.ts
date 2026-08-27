/**
 * Z.ai GLM providers sharing the GLM header and model constants.
 */

import { CONTEXT_CONFIG } from "../../../src/shared/constants/context";
import {
  GLM_SHARED_HEADERS,
  GLM_SHARED_MODELS,
  GLMT_REQUEST_DEFAULTS,
  GLMT_TIMEOUT_MS,
} from "../glmProvider.ts";
import type { RegistryEntry } from "../registry-types.ts";

export const GLM_PROVIDERS: Record<string, RegistryEntry> = {
  glm: {
    id: "glm",
    alias: "glm",
    format: "claude",
    executor: "default",
    baseUrl: "https://api.z.ai/api/anthropic/v1/messages",
    defaultContextLength: CONTEXT_CONFIG.defaultLimit,
    urlSuffix: "?beta=true",
    authType: "apikey",
    authHeader: "x-api-key",
    headers: GLM_SHARED_HEADERS,
    models: [...GLM_SHARED_MODELS],
  },

  glmt: {
    id: "glmt",
    alias: "glmt",
    format: "claude",
    executor: "default",
    baseUrl: "https://api.z.ai/api/anthropic/v1/messages",
    defaultContextLength: 200000,
    urlSuffix: "?beta=true",
    authType: "apikey",
    authHeader: "x-api-key",
    headers: GLM_SHARED_HEADERS,
    requestDefaults: GLMT_REQUEST_DEFAULTS,
    timeoutMs: GLMT_TIMEOUT_MS,
    models: [...GLM_SHARED_MODELS],
  },
};
