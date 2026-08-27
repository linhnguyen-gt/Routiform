/**
 * API key provider registry entries.
 *
 * Assembled from per-family modules in open-sse/config/registry-providers-apikey/.
 * Entry order is load-bearing for catalog display — keep the spread order stable.
 */

import type { RegistryEntry } from "./registry-types.ts";
import { FRONTIER_PROVIDERS } from "./registry-providers-apikey/frontier-providers.ts";
import { ROUTER_PROVIDERS } from "./registry-providers-apikey/router-providers.ts";
import { GLM_PROVIDERS } from "./registry-providers-apikey/glm-providers.ts";
import { WEB_PROVIDERS } from "./registry-providers-apikey/web-providers.ts";
import { ZAI_PROVIDERS } from "./registry-providers-apikey/zai-providers.ts";
import { KIMI_PROVIDERS } from "./registry-providers-apikey/kimi-providers.ts";
import { CODING_AGENT_PROVIDERS } from "./registry-providers-apikey/coding-agent-providers.ts";
import { MINIMAX_PROVIDERS } from "./registry-providers-apikey/minimax-providers.ts";
import { ALIYUN_PROVIDERS } from "./registry-providers-apikey/aliyun-providers.ts";
import { OPENAI_FORMAT_PROVIDERS } from "./registry-providers-apikey/openai-format-providers.ts";
import { GPU_CLOUD_PROVIDERS } from "./registry-providers-apikey/gpu-cloud-providers.ts";
import { KILO_GATEWAY_PROVIDERS } from "./registry-providers-apikey/kilo-gateway-providers.ts";
import { VERTEX_PROVIDERS } from "./registry-providers-apikey/vertex-providers.ts";
import { ALIBABA_PROVIDERS } from "./registry-providers-apikey/alibaba-providers.ts";

export const APIKEY_PROVIDERS: Record<string, RegistryEntry> = {
  ...FRONTIER_PROVIDERS,
  ...ROUTER_PROVIDERS,
  ...GLM_PROVIDERS,
  ...WEB_PROVIDERS,
  ...ZAI_PROVIDERS,
  ...KIMI_PROVIDERS,
  ...CODING_AGENT_PROVIDERS,
  ...MINIMAX_PROVIDERS,
  ...ALIYUN_PROVIDERS,
  ...OPENAI_FORMAT_PROVIDERS,
  ...GPU_CLOUD_PROVIDERS,
  ...KILO_GATEWAY_PROVIDERS,
  ...VERTEX_PROVIDERS,
  ...ALIBABA_PROVIDERS,
};
