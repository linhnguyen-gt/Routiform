import { logAuditEvent } from "@/lib/compliance";
import {
  getBackgroundDegradationConfig,
  getBackgroundTaskReason,
  getDegradedModel,
} from "../../services/backgroundTaskDetector.ts";

/**
 * Handles background task detection and model redirection.
 * Detects background tasks (e.g., code indexing, long-running operations)
 * and redirects to cheaper/faster models to optimize resource usage.
 *
 * @param model - Current model name
 * @param body - Request body (may be mutated if redirection occurs)
 * @param headers - Request headers for background task detection
 * @param apiKeyInfo - API key metadata for audit logging
 * @param connectionId - Connection ID for audit logging
 * @param provider - Provider name for audit logging
 * @param log - Logger instance
 * @returns Updated model name (may be same as input if no redirection)
 */
export function handleBackgroundTaskRedirection({
  model,
  body,
  headers,
  apiKeyInfo,
  connectionId,
  provider,
  log,
}: {
  model: string;
  body: Record<string, unknown> | null;
  headers?: Record<string, string | string[] | undefined>;
  apiKeyInfo?: { name?: string } | null;
  connectionId?: string | null;
  provider: string;
  log?: {
    info?: (tag: string, message: string) => void;
  } | null;
}): string {
  const bgConfig = getBackgroundDegradationConfig();
  // Normalize headers to Record<string, string>
  const normalizedHeaders = headers
    ? Object.fromEntries(
        Object.entries(headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v || ""])
      )
    : undefined;
  const backgroundReason = bgConfig.enabled
    ? getBackgroundTaskReason(body, normalizedHeaders)
    : null;

  if (backgroundReason) {
    const degradedModel = getDegradedModel(model);
    if (degradedModel !== model) {
      const originalModel = model;
      log?.info?.(
        "BACKGROUND",
        `Background task redirect (${backgroundReason}): ${originalModel} → ${degradedModel}`
      );

      // Update model in body
      if (body && typeof body === "object") {
        body.model = degradedModel;
      }

      // Log audit event
      logAuditEvent({
        action: "routing.background_task_redirect",
        actor: apiKeyInfo?.name || "system",
        target: connectionId || provider || "chat",
        details: {
          original_model: originalModel,
          redirected_to: degradedModel,
          reason: backgroundReason,
        },
      });

      return degradedModel;
    }
  }

  return model;
}
