import { safeOutboundFetch } from "@/lib/network/safeOutboundFetch";
import { buildBearerHeaders, isTimeoutLikeError } from "./http-utils";
import { addModelsSuffix, resolveChatUrl } from "./url-utils";

export async function validateOpenAILikeProvider({
  provider,
  apiKey,
  baseUrl,
  providerSpecificData = {},
  modelId = "gpt-4o-mini",
  modelsUrl: customModelsUrl,
}: {
  provider: string;
  apiKey: string;
  baseUrl: string;
  providerSpecificData?: Record<string, unknown>;
  modelId?: string;
  modelsUrl?: string;
}) {
  if (!baseUrl) {
    return { valid: false, error: "Missing base URL" };
  }

  const modelsUrl = customModelsUrl || addModelsSuffix(baseUrl);
  if (!modelsUrl) {
    return { valid: false, error: "Invalid models endpoint" };
  }

  let modelsRes: Response;
  try {
    modelsRes = await safeOutboundFetch(
      modelsUrl,
      {
        method: "GET",
        headers: buildBearerHeaders(apiKey, providerSpecificData),
      },
      // Same operator-configured base URL as the models path, same opt-in, written out for the
      // same reason. See handle-openai-compatible-models.ts.
      {
        timeoutMs: 10_000,
        guard: { allowLoopback: true, allowPrivateAddress: true },
      }
    );
  } catch (error) {
    if (isTimeoutLikeError(error)) {
      return { valid: false, error: "Provider validation timeout (10s)", statusCode: 504 };
    }
    throw error;
  }

  if (modelsRes.ok) {
    return { valid: true, error: null };
  }

  if (modelsRes.status === 401 || modelsRes.status === 403) {
    return { valid: false, error: "Invalid API key" };
  }

  const chatUrl = resolveChatUrl(provider, baseUrl, providerSpecificData);
  if (!chatUrl) {
    return { valid: false, error: `Validation failed: ${modelsRes.status}` };
  }

  const testModelId =
    typeof providerSpecificData.validationModelId === "string"
      ? providerSpecificData.validationModelId
      : modelId;

  const testBody = {
    model: testModelId,
    messages: [{ role: "user", content: "test" }],
    max_tokens: 1,
  };

  let chatRes: Response;
  try {
    chatRes = await safeOutboundFetch(
      chatUrl,
      {
        method: "POST",
        headers: buildBearerHeaders(apiKey, providerSpecificData),
        body: JSON.stringify(testBody),
      },
      { timeoutMs: 15_000 }
    );
  } catch (error) {
    if (isTimeoutLikeError(error)) {
      return { valid: false, error: "Provider validation timeout (15s)", statusCode: 504 };
    }
    throw error;
  }

  if (chatRes.ok) {
    return { valid: true, error: null };
  }

  if (chatRes.status === 401 || chatRes.status === 403) {
    return { valid: false, error: "Invalid API key" };
  }

  if (chatRes.status === 404 || chatRes.status === 405) {
    return { valid: false, error: "Provider validation endpoint not supported" };
  }

  if (chatRes.status >= 500) {
    return { valid: false, error: `Provider unavailable (${chatRes.status})` };
  }

  // 4xx other than auth (e.g., invalid model/body) usually means auth passed.
  return { valid: true, error: null };
}
