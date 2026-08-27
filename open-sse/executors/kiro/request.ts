/**
 * Request building for the Kiro (AWS CodeWhisperer) API — URL region resolution
 * and header assembly.
 *
 * @module executors/kiro/request
 */
import { v4 as uuidv4 } from "uuid";
import type { ProviderCredentials } from "../base.ts";

// AWS region ids only ("us-east-1", "eu-west-1", ...) — guards against building a bogus
// host from an unexpected providerSpecificData.region value.
const AWS_REGION_RE = /^[a-z]{2}-[a-z]+-\d$/;
const KIRO_DEFAULT_REGION = "us-east-1";

/**
 * Build the CodeWhisperer host from the connection's stored region (IdC/SSO accounts can
 * live outside us-east-1 — using the wrong host returns 403). Falls back to us-east-1 when
 * no region is persisted or the value doesn't look like an AWS region id.
 */
export function buildKiroUrl(
  config: { baseUrl?: string },
  credentials: ProviderCredentials | null
): string {
  const storedRegion = credentials?.providerSpecificData?.region;
  const region =
    typeof storedRegion === "string" && AWS_REGION_RE.test(storedRegion)
      ? storedRegion
      : KIRO_DEFAULT_REGION;
  const baseUrl =
    config.baseUrl ||
    `https://codewhisperer.${KIRO_DEFAULT_REGION}.amazonaws.com/generateAssistantResponse`;
  return baseUrl.replace(
    /codewhisperer\.[a-z0-9-]+\.amazonaws\.com/,
    `codewhisperer.${region}.amazonaws.com`
  );
}

export function buildKiroHeaders(
  configHeaders: Record<string, string> | undefined,
  credentials: ProviderCredentials
): Record<string, string> {
  const headers: Record<string, string> = {
    ...configHeaders,
    "Amz-Sdk-Request": "attempt=1; max=3",
    "Amz-Sdk-Invocation-Id": uuidv4(),
    "x-amzn-bedrock-cache-control": "enable",
    "anthropic-beta": "prompt-caching-2024-07-31",
  };

  if (credentials.accessToken) {
    headers["Authorization"] = `Bearer ${credentials.accessToken}`;
  }

  return headers;
}

/**
 * Kiro uses conversationState.currentMessage.userInputMessage.modelId,
 * not a top-level "model" field. chatCore injects translatedBody.model
 * which Kiro API rejects as unknown top-level field.
 */
export function transformKiroRequest(body: unknown): unknown {
  const { model: _model, ...rest } = body as Record<string, unknown>;
  return rest;
}
