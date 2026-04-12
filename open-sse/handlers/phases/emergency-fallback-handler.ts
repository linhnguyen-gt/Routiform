import {
  EMERGENCY_FALLBACK_CONFIG,
  isFallbackDecision,
  shouldUseFallback,
} from "../../services/emergencyFallback.ts";
import { getExecutor } from "../../executors/index.ts";

/**
 * Result of emergency fallback attempt.
 */
type JsonRecord = Record<string, unknown>;

type ProviderCredentials = Record<string, unknown> & {
  providerSpecificData?: Record<string, unknown> | null;
};

export interface EmergencyFallbackResult {
  /** Whether fallback was attempted */
  attempted: boolean;
  /** Whether fallback succeeded */
  success: boolean;
  /** Fallback response (if successful) */
  response?: Response;
  /** Fallback URL (if successful) */
  url?: string;
  /** Fallback headers (if successful) */
  headers?: HeadersInit;
  /** Transformed body (if successful) */
  transformedBody?: JsonRecord;
}

/**
 * Handles emergency fallback for budget-related errors.
 *
 * ClawRouter Feature #09/017: When a non-streaming request fails with a
 * budget-related error (402 or budget keywords), redirects to a free-tier
 * model (e.g., nvidia/gpt-oss-120b at $0.00/M) before returning the error
 * to the combo router. This gives one last attempt so the user's session
 * stays alive.
 *
 * @param statusCode - HTTP status code from provider
 * @param message - Error message from provider
 * @param stream - Whether this is a streaming request
 * @param requestHasTools - Whether request includes tool definitions
 * @param provider - Current provider
 * @param translatedBody - Translated request body
 * @param credentials - Provider credentials
 * @param streamController - Stream controller for abort signal
 * @param extendedContext - Extended context flag
 * @param log - Logger instance
 * @returns Emergency fallback result
 */
export async function handleEmergencyFallback({
  statusCode,
  message,
  stream,
  requestHasTools,
  provider,
  translatedBody,
  credentials,
  streamController,
  extendedContext,
  log,
}: {
  statusCode: number;
  message: string;
  stream: boolean;
  requestHasTools: boolean;
  provider: string;
  translatedBody: JsonRecord;
  credentials: ProviderCredentials;
  streamController: { signal: AbortSignal };
  extendedContext?: boolean;
  log?: {
    info?: (tag: string, message: string) => void;
    warn?: (tag: string, message: string) => void;
  } | null;
}): Promise<EmergencyFallbackResult> {
  // Emergency fallback only applies to non-streaming requests
  if (stream) {
    return { attempted: false, success: false };
  }

  const fbDecision = shouldUseFallback(
    statusCode,
    message,
    requestHasTools,
    EMERGENCY_FALLBACK_CONFIG
  );

  if (!isFallbackDecision(fbDecision)) {
    return { attempted: false, success: false };
  }

  // Cross-provider fallback (e.g. github → nvidia) requires that provider's credentials.
  // This layer only has the current request's credentials — do not call another executor with mismatched auth.
  if (fbDecision.provider !== provider) {
    log?.warn?.(
      "EMERGENCY_FALLBACK",
      `Skip cross-provider emergency fallback (${provider} → ${fbDecision.provider}) — handled in app-layer chat handler when credentials exist`
    );
    return { attempted: false, success: false };
  }

  log?.info?.("EMERGENCY_FALLBACK", fbDecision.reason);

  try {
    const fbExecutor = getExecutor(fbDecision.provider);
    const fbResult = await fbExecutor.execute({
      model: fbDecision.model,
      body: {
        ...translatedBody,
        model: fbDecision.model,
        max_tokens: Math.min(
          typeof translatedBody.max_tokens === "number"
            ? translatedBody.max_tokens
            : fbDecision.maxOutputTokens,
          fbDecision.maxOutputTokens
        ),
      },
      stream: false,
      credentials: credentials,
      signal: streamController.signal,
      log,
      extendedContext,
    });

    if (fbResult.response.ok) {
      log?.info?.(
        "EMERGENCY_FALLBACK",
        `Serving ${fbDecision.provider}/${fbDecision.model} as budget fallback`
      );
      return {
        attempted: true,
        success: true,
        response: fbResult.response,
        url: fbResult.url,
        headers: fbResult.headers,
        transformedBody: fbResult.transformedBody,
      };
    } else {
      log?.warn?.(
        "EMERGENCY_FALLBACK",
        `Emergency fallback also failed (${fbResult.response.status})`
      );
      return { attempted: true, success: false };
    }
  } catch (fbErr) {
    const errMessage = fbErr instanceof Error ? fbErr.message : String(fbErr);
    log?.warn?.("EMERGENCY_FALLBACK", `Emergency fallback error: ${errMessage}`);
    return { attempted: true, success: false };
  }
}
