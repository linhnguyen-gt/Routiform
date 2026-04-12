import { HTTP_STATUS } from "../../config/constants.ts";
import { recordContextCompression, recordContextRejection } from "../../services/comboMetrics.ts";
import { compressContext, validateContextLimit } from "../../services/contextManager.ts";
import { createErrorResult } from "../../utils/error.ts";

/**
 * Result of context validation and compression.
 */
type JsonRecord = Record<string, unknown>;

export interface ContextValidationResult {
  /** Whether validation passed (context is within limits) */
  valid: boolean;
  /** Updated request body (may be compressed) */
  body: JsonRecord;
  /** Error result if validation failed */
  error?: {
    success: false;
    status: number;
    error: string;
  };
}

/**
 * Validates request context size and attempts compression if needed.
 *
 * Phase 1 & 2: Context Validation & Compression
 * - Validates context window BEFORE translation to catch oversized requests early
 * - Attempts compression if request exceeds limits
 * - Tracks compression metrics for combo requests
 * - Returns error if context still exceeds limits after compression
 *
 * @param body - Request body to validate
 * @param provider - Provider name for context limit lookup
 * @param model - Model name for context limit lookup
 * @param combo - Combo configuration (if applicable)
 * @param comboName - Combo name for metrics tracking
 * @param reqLogger - Request logger for dashboard visibility
 * @param log - Logger instance
 * @param persistFailureUsage - Callback to persist failure metrics
 * @returns Validation result with updated body or error
 */
export function validateAndCompressContext({
  body,
  provider,
  model,
  combo,
  comboName,
  reqLogger,
  log,
  persistFailureUsage,
}: {
  body: JsonRecord;
  provider: string;
  model: string;
  combo?: Record<string, unknown> | null;
  comboName?: string;
  reqLogger?: {
    logContextValidation?: (data: {
      originalTokens: number;
      limit: number;
      exceeded: number;
      compressed: boolean;
      finalTokens: number;
      layers?: string[];
      rejected: boolean;
    }) => void;
  } | null;
  log?: {
    info?: (tag: string, message: string) => void;
    warn?: (tag: string, message: string) => void;
  } | null;
  persistFailureUsage: (statusCode: number, errorCode?: string | null) => void;
}): ContextValidationResult {
  const validation = validateContextLimit(body, provider, model, combo);

  if (!validation.valid) {
    log?.warn?.(
      "CONTEXT",
      `Request exceeds context limit: ${validation.estimatedTokens} > ${validation.limit} (exceeded by ${validation.exceeded} tokens)`
    );

    // Try compression
    const compressionResult = compressContext(body, {
      provider,
      model,
      maxTokens: validation.limit,
    });

    if (compressionResult.compressed) {
      body = compressionResult.body;
      const newValidation = validateContextLimit(body, provider, model, combo);

      if (newValidation.valid) {
        log?.info?.(
          "CONTEXT",
          `Compressed: ${compressionResult.stats.original} → ${compressionResult.stats.final} tokens (limit=${validation.limit})`
        );

        // Track compression metrics
        if (comboName) {
          recordContextCompression(
            comboName,
            `${provider}/${model}`,
            compressionResult.stats.original,
            compressionResult.stats.final
          );
        }

        // Log successful context compression to reqLogger for dashboard visibility
        reqLogger?.logContextValidation?.({
          originalTokens: validation.estimatedTokens,
          limit: validation.limit,
          exceeded: validation.exceeded,
          compressed: true,
          finalTokens: newValidation.estimatedTokens,
          layers: compressionResult.stats.layers?.map((l) => l.name) || [],
          rejected: false,
        });

        return { valid: true, body };
      } else {
        // Still oversized after compression - track rejection
        if (comboName) {
          recordContextRejection(comboName, `${provider}/${model}`);
        }

        // Log context rejection to reqLogger for dashboard visibility
        reqLogger?.logContextValidation?.({
          originalTokens: validation.estimatedTokens,
          limit: validation.limit,
          exceeded: validation.exceeded,
          compressed: true,
          finalTokens: newValidation.estimatedTokens,
          rejected: true,
        });

        persistFailureUsage(HTTP_STATUS.BAD_REQUEST, "context_length_exceeded");

        return {
          valid: false,
          body,
          error: createErrorResult(
            HTTP_STATUS.BAD_REQUEST,
            `Request exceeds context limit even after compression: ${newValidation.estimatedTokens} > ${validation.limit} tokens. Please reduce message history or input size.`
          ),
        };
      }
    } else {
      // Compression didn't help or wasn't applicable - track rejection
      if (comboName) {
        recordContextRejection(comboName, `${provider}/${model}`);
      }

      persistFailureUsage(HTTP_STATUS.BAD_REQUEST, "context_length_exceeded");

      return {
        valid: false,
        body,
        error: createErrorResult(
          HTTP_STATUS.BAD_REQUEST,
          `Request exceeds context limit: ${validation.estimatedTokens} > ${validation.limit} tokens. Please reduce message history or input size.`
        ),
      };
    }
  }

  return { valid: true, body };
}
