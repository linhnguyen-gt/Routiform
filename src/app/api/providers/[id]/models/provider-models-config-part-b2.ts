import { asRecord } from "./json-utils";
import type { ProviderModelsConfigEntry } from "./provider-models-config-types";

export const providerModelsConfigPartB2: Record<string, ProviderModelsConfigEntry> = {
  cerebras: {
    url: "https://api.cerebras.ai/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => {
      const record = asRecord(data);
      return (record.data as unknown[]) || (record.models as unknown[]) || [];
    },
  },
  cohere: {
    url: "https://api.cohere.com/v2/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => {
      const record = asRecord(data);
      return (record.data as unknown[]) || (record.models as unknown[]) || [];
    },
  },
  nvidia: {
    url: "https://integrate.api.nvidia.com/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => {
      const record = asRecord(data);
      return (record.data as unknown[]) || (record.models as unknown[]) || [];
    },
  },
  nebius: {
    url: "https://api.tokenfactory.nebius.com/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => {
      const record = asRecord(data);
      return (record.data as unknown[]) || (record.models as unknown[]) || [];
    },
  },
  kilocode: {
    url: "https://api.kilo.ai/api/openrouter/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => {
      const record = asRecord(data);
      return (record.data as unknown[]) || (record.models as unknown[]) || [];
    },
  },
  "ollama-cloud": {
    url: "https://ollama.com/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => {
      const record = asRecord(data);
      return (record.models as unknown[]) || (record.data as unknown[]) || [];
    },
  },
  synthetic: {
    url: "https://api.synthetic.new/openai/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => {
      const record = asRecord(data);
      return (record.data as unknown[]) || (record.models as unknown[]) || [];
    },
  },
  "kilo-gateway": {
    url: "https://api.kilo.ai/api/gateway/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => {
      const record = asRecord(data);
      return (record.data as unknown[]) || (record.models as unknown[]) || [];
    },
  },
  "opencode-zen": {
    url: "https://opencode.ai/zen/v1/models",
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
