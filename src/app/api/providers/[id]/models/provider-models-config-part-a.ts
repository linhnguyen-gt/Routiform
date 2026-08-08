import { asRecord } from "./json-utils";
import { KIMI_CODING_MODELS_CONFIG } from "./kimi-coding-models-config";
import type { ProviderModelsConfigEntry } from "./provider-models-config-types";

export const providerModelsConfigPartA: Record<string, ProviderModelsConfigEntry> = {
  claude: {
    url: "https://api.anthropic.com/v1/models",
    method: "GET",
    headers: {
      "Anthropic-Version": "2023-06-01",
      "Content-Type": "application/json",
    },
    authHeader: "x-api-key",
    parseResponse: (data) => {
      const dataObj = data as { data?: unknown[] };
      return dataObj.data || [];
    },
  },
  antigravity: {
    url: "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:models",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    body: {},
    parseResponse: (data) => {
      const dataObj = data as { models?: unknown[] };
      return dataObj.models || [];
    },
  },
  openai: {
    url: "https://api.openai.com/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => {
      const dataObj = data as { data?: unknown[] };
      return dataObj.data || [];
    },
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => {
      const dataObj = data as { data?: unknown[] };
      return dataObj.data || [];
    },
  },
  "xiaomi-mimo": {
    url: "https://api.xiaomimimo.com/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => {
      const dataObj = data as { data?: unknown[]; models?: unknown[] };
      return dataObj.data || dataObj.models || [];
    },
  },
  "xiaomi-mimo-token-plan": {
    url: "https://token-plan-cn.xiaomimimo.com/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => {
      const dataObj = data as { data?: unknown[]; models?: unknown[] };
      return dataObj.data || dataObj.models || [];
    },
  },
  kimi: {
    url: "https://api.moonshot.ai/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => {
      const dataObj = data as { data?: unknown[] };
      return dataObj.data || [];
    },
  },
  "kimi-coding": {
    ...KIMI_CODING_MODELS_CONFIG,
  },
  "kimi-coding-apikey": {
    ...KIMI_CODING_MODELS_CONFIG,
  },
  anthropic: {
    url: "https://api.anthropic.com/v1/models",
    method: "GET",
    headers: {
      "Anthropic-Version": "2023-06-01",
      "Content-Type": "application/json",
    },
    authHeader: "x-api-key",
    parseResponse: (data) => {
      const dataObj = data as { data?: unknown[] };
      return dataObj.data || [];
    },
  },
  deepseek: {
    url: "https://api.deepseek.com/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => {
      const record = asRecord(data);
      return (record.data as unknown[]) || (record.models as unknown[]) || [];
    },
  },
};
