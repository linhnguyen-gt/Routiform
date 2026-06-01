import { updateProviderConnection } from "@/lib/db/providers";
import { createLogger } from "@/shared/utils/logger";
import { COOLDOWN_MS } from "../../config/constants.ts";
import { lockModelIfPerModelQuota } from "../../services/accountFallback.ts";
import { PROVIDER_ERROR_TYPES, classifyProviderError } from "../../services/errorClassifier.ts";
import type { PersistProviderAccountErrorStateOptions } from "../types/chat-core.ts";

const log = createLogger("provider-account-error-state");

function formatLocalTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString();
}

export async function persistProviderAccountErrorState({
  connectionId,
  provider,
  model,
  statusCode,
  message,
  retryAfterMs,
}: PersistProviderAccountErrorStateOptions): Promise<void> {
  const errorType = classifyProviderError(statusCode, message);
  if (!connectionId || !errorType) return;

  try {
    if (errorType === PROVIDER_ERROR_TYPES.FORBIDDEN) {
      // Subscription/capacity errors are temporary, not permanent bans
      const lowerMessage = (message || "").toLowerCase();
      if (
        lowerMessage.includes("subscription") ||
        lowerMessage.includes("high volume") ||
        lowerMessage.includes("capacity is being added") ||
        lowerMessage.includes("upgrade for access")
      ) {
        const retryMs = retryAfterMs || COOLDOWN_MS.rateLimit;
        // Subscription gating is per-model (e.g. ollama-cloud free tier
        // allows some models but blocks others). Prefer a per-model lock so
        // testing other models on the same connection isn't blocked.
        const lockedPerModel = lockModelIfPerModelQuota(
          provider,
          connectionId,
          model || null,
          message || "subscription required",
          retryMs
        );
        if (lockedPerModel) {
          console.warn(
            `[provider] Node ${connectionId.slice(0, 8)} model ${model} 403 subscription — per-model cooldown ${Math.ceil(retryMs / 1000)}s`
          );
        } else {
          await updateProviderConnection(connectionId, {
            rateLimitedUntil: new Date(Date.now() + retryMs).toISOString(),
            testStatus: "unavailable",
            lastErrorType: "rate_limited",
            lastError: message,
            errorCode: statusCode,
          });
          console.warn(
            `[provider] Node ${connectionId.slice(0, 8)} subscription/capacity 403 — connection-level cooldown ${Math.ceil(retryMs / 1000)}s`
          );
        }
      } else {
        await updateProviderConnection(connectionId, {
          isActive: false,
          testStatus: "banned",
          lastErrorType: errorType,
          lastError: message,
          errorCode: statusCode,
        });
        console.warn(
          `[provider] Node ${connectionId} banned (${statusCode}) — disabling permanently`
        );
      }
    } else if (errorType === PROVIDER_ERROR_TYPES.ACCOUNT_DEACTIVATED) {
      await updateProviderConnection(connectionId, {
        isActive: false,
        testStatus: "deactivated",
        lastErrorType: errorType,
        lastError: message,
        errorCode: statusCode,
      });
      console.warn(
        `[provider] Node ${connectionId} account deactivated (${statusCode}) — disabling permanently`
      );
    } else if (errorType === PROVIDER_ERROR_TYPES.RATE_LIMITED) {
      if (
        lockModelIfPerModelQuota(
          provider,
          connectionId,
          model,
          "rate_limited",
          retryAfterMs || COOLDOWN_MS.rateLimit
        )
      ) {
        console.warn(
          `[provider] Node ${connectionId} model-only rate limited (${statusCode}) for ${model} - ${Math.ceil((retryAfterMs || COOLDOWN_MS.rateLimit) / 1000)}s (connection stays active)`
        );
      } else {
        const retryMs = retryAfterMs || COOLDOWN_MS.rateLimit;
        const rateLimitedUntil = new Date(Date.now() + retryMs).toISOString();
        await updateProviderConnection(connectionId, {
          rateLimitedUntil: rateLimitedUntil,
          testStatus: "credits_exhausted",
          lastErrorType: errorType,
          lastError: message,
          errorCode: statusCode,
          healthCheckInterval: null,
          lastHealthCheckAt: null,
        });
        console.warn(
          `[provider] Node ${connectionId} rate limited (${statusCode}) - Next available at ${rateLimitedUntil} (local ${formatLocalTime(rateLimitedUntil)})`
        );
      }
    } else if (errorType === PROVIDER_ERROR_TYPES.QUOTA_EXHAUSTED) {
      if (
        lockModelIfPerModelQuota(
          provider,
          connectionId,
          model,
          "quota_exhausted",
          retryAfterMs || COOLDOWN_MS.rateLimit
        )
      ) {
        console.warn(
          `[provider] Node ${connectionId} model-only quota exhausted (${statusCode}) for ${model} - ${Math.ceil((retryAfterMs || COOLDOWN_MS.rateLimit) / 1000)}s (connection stays active)`
        );
      } else {
        await updateProviderConnection(connectionId, {
          testStatus: "credits_exhausted",
          lastErrorType: errorType,
          lastError: message,
          errorCode: statusCode,
        });
        console.warn(`[provider] Node ${connectionId} exhausted quota (${statusCode})`);
      }
    } else if (errorType === PROVIDER_ERROR_TYPES.UNAUTHORIZED) {
      await updateProviderConnection(connectionId, {
        lastErrorType: errorType,
        lastError: message,
        errorCode: statusCode,
      });
    } else if (errorType === PROVIDER_ERROR_TYPES.OAUTH_INVALID_TOKEN) {
      await updateProviderConnection(connectionId, {
        lastErrorType: errorType,
        lastError: message,
        errorCode: statusCode,
      });
      console.warn(
        `[provider] Node ${connectionId} OAuth token invalid (${statusCode}) — token refresh available`
      );
    } else if (errorType === PROVIDER_ERROR_TYPES.PROJECT_ROUTE_ERROR) {
      await updateProviderConnection(connectionId, {
        lastErrorType: errorType,
        lastError: message,
        errorCode: statusCode,
      });
      console.warn(
        `[provider] Node ${connectionId} project routing error (${statusCode}) — not banning`
      );
    }
  } catch (err) {
    log.error(
      {
        err,
        operation: "persistProviderAccountErrorState",
        provider,
        providerAccountId: connectionId,
        model,
        statusCode,
        errorType,
        retryAfterMs,
      },
      "Failed to persist provider account error state"
    );
  }
}
