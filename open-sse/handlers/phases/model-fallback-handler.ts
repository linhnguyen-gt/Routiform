import {
  findLargerContextModel,
  getModelFamily,
  getNextFamilyFallback,
  isContextOverflowError,
  isModelUnavailableError,
} from "../../services/modelFamilyFallback.ts";
import { buildErrorBody as _buildErrorBody, createErrorResult } from "../../utils/error.ts";

/**
 * Result of model fallback attempt.
 */
export interface ModelFallbackResult {
  /** Whether fallback was attempted */
  attempted: boolean;
  /** Whether fallback succeeded */
  success: boolean;
  /** Next model to try (if fallback was attempted) */
  nextModel?: string;
  /** Error result if fallback failed or wasn't attempted */
  error?: {
    success: false;
    status: number;
    error: string;
    retryAfterMs?: number;
  };
}

/**
 * Handles T5 intra-family model fallback.
 *
 * Before returning a model-unavailable or context-overflow error upstream,
 * tries sibling models from the same family. This keeps the request alive
 * on the same account instead of failing the entire combo.
 *
 * Supports two fallback scenarios:
 * 1. Model unavailable: Try next model in family
 * 2. Context overflow: Try larger context model or next in family
 *
 * @param statusCode - HTTP status code from provider
 * @param message - Error message from provider
 * @param currentModel - Current model being tried
 * @param triedModels - Set of models already attempted
 * @param log - Logger instance
 * @returns Fallback result with next model or error
 */
export function handleModelFallback({
  statusCode,
  message,
  currentModel,
  triedModels,
  log,
}: {
  statusCode: number;
  message: string;
  currentModel: string;
  triedModels: Set<string>;
  log?: {
    info?: (tag: string, message: string) => void;
  } | null;
}): ModelFallbackResult {
  // Check for model unavailable error
  if (isModelUnavailableError(statusCode, message)) {
    const nextModel = getNextFamilyFallback(currentModel, triedModels);
    if (nextModel) {
      triedModels.add(nextModel);
      log?.info?.(
        "MODEL_FALLBACK",
        `${currentModel} unavailable (${statusCode}) → trying ${nextModel}`
      );
      return {
        attempted: true,
        success: false, // Will be determined by caller after execution
        nextModel,
      };
    } else {
      return {
        attempted: false,
        success: false,
        error: createErrorResult(statusCode, message),
      };
    }
  }

  // Check for context overflow error
  if (isContextOverflowError(statusCode, message)) {
    const familyCandidates = getModelFamily(currentModel).filter(
      (m) => m !== currentModel && !triedModels.has(m)
    );
    const nextModel =
      findLargerContextModel(currentModel, familyCandidates) ??
      getNextFamilyFallback(currentModel, triedModels);

    if (nextModel) {
      triedModels.add(nextModel);
      log?.info?.(
        "CONTEXT_OVERFLOW_FALLBACK",
        `${currentModel} context overflow → trying ${nextModel}`
      );
      return {
        attempted: true,
        success: false, // Will be determined by caller after execution
        nextModel,
      };
    } else {
      return {
        attempted: false,
        success: false,
        error: createErrorResult(statusCode, message),
      };
    }
  }

  // Not a fallback-eligible error
  return {
    attempted: false,
    success: false,
  };
}

/**
 * Determines if an error is eligible for model fallback.
 */
export function shouldAttemptModelFallback(statusCode: number, message: string): boolean {
  return (
    isModelUnavailableError(statusCode, message) || isContextOverflowError(statusCode, message)
  );
}
