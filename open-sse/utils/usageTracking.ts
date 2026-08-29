/**
 * Token Usage Tracking - Extract, normalize, estimate and log token usage
 */

import {
  getLoggedInputTokens,
  getLoggedOutputTokens,
  getPromptCacheCreationTokens,
  getPromptCacheReadTokens,
} from "@/lib/usage/tokenAccounting";
import { FORMATS } from "../translator/formats.ts";

// ANSI color codes
export const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

/**
 * Safety buffer added to reported token usage to prevent clients from hitting
 * context window limits. Accounts for overhead from system prompts,
 * tool definitions, and format translation that may not be reflected in raw usage.
 *
 * Configurable via:
 *   - Settings API / Dashboard: `usageTokenBuffer` (persisted in DB)
 *   - Environment variable: `USAGE_TOKEN_BUFFER`
 *   - Defaults to 2000 if neither is set
 *
 * Set to 0 to disable the buffer entirely (raw provider token counts).
 */
const DEFAULT_BUFFER_TOKENS = 2000;

let _cachedBuffer: number | null = null;
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // Re-read from DB/env every 30s

function getBufferTokens(): number {
  const now = Date.now();
  const isExpired = _cachedBuffer !== null && now - _cacheTimestamp >= CACHE_TTL_MS;

  if (_cachedBuffer !== null && !isExpired) {
    return _cachedBuffer;
  }

  // Priority: env var > cached DB value > default
  const envVal = process.env.USAGE_TOKEN_BUFFER;
  if (envVal !== undefined) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      _cachedBuffer = parsed;
      _cacheTimestamp = now;
      return parsed;
    }
  }

  // Return cached value or default; kick off async DB read to update cache.
  // On first call (_cachedBuffer is null), use the default.
  // On TTL expiry (_cachedBuffer is stale), continue returning the stale value
  // while refreshing asynchronously — prevents blocking the hot path.
  if (_cachedBuffer === null || isExpired) {
    if (_cachedBuffer === null) {
      _cachedBuffer = DEFAULT_BUFFER_TOKENS;
    }
    _cacheTimestamp = now;
    _loadBufferFromDb();
  }
  return _cachedBuffer;
}

async function _loadBufferFromDb(): Promise<void> {
  try {
    const { getSettings } = await import("@/lib/db/settings");
    const settings = await getSettings();
    const val = settings.usageTokenBuffer;
    if (typeof val === "number" && val >= 0) {
      _cachedBuffer = val;
      _cacheTimestamp = Date.now();
    }
  } catch {
    // DB not ready yet or settings unavailable — keep current value
  }
}

/** Force-refresh the buffer from settings (e.g. after a settings update). */
export function invalidateBufferTokensCache(): void {
  _cachedBuffer = null;
  _cacheTimestamp = 0;
}

// Get HH:MM:SS timestamp
function getTimeString() {
  return new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Add buffer tokens to usage to prevent context errors
 * @param {object} usage - Usage object (supported format)
 * @returns {object} Usage with buffer added
 */
export function addBufferToUsage(usage) {
  if (!usage || typeof usage !== "object") return usage;

  const buffer = getBufferTokens();
  if (buffer === 0) return usage;

  const result = { ...usage };

  // Claude Code sums exclusive input_tokens + cache_*. Padding exclusive input
  // when cache is present makes the meter tick 17% → 18% every turn.
  const cacheTokens = getPromptCacheReadTokens(result) + getPromptCacheCreationTokens(result);
  if (cacheTokens > 0) return result;

  if (result.input_tokens !== undefined) {
    result.input_tokens += buffer;
  }

  if (result.prompt_tokens !== undefined) {
    result.prompt_tokens += buffer;
  }

  if (result.total_tokens !== undefined) {
    result.total_tokens += buffer;
  } else if (result.prompt_tokens !== undefined && result.completion_tokens !== undefined) {
    result.total_tokens = result.prompt_tokens + result.completion_tokens;
  }

  return result;
}

function finiteTokenCount(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function filterUsageForFormat(usage, targetFormat) {
  if (!usage || typeof usage !== "object") return usage;

  // Cross-map between Claude-style and OpenAI-style field names before filtering.
  // Anthropic `input_tokens` is cache-EXCLUSIVE; OpenAI `prompt_tokens` (and
  // OpenAI Responses `input_tokens`) are cache-INCLUSIVE. Copying one onto
  // the other without peeling/adding cache makes Claude Code double-count
  // cache_read and OpenAI clients drop it.
  const convertedUsage = { ...usage };
  if (targetFormat === FORMATS.CLAUDE) {
    const cacheRead = getPromptCacheReadTokens(convertedUsage);
    const cacheCreate = getPromptCacheCreationTokens(convertedUsage);
    if (convertedUsage.cache_read_input_tokens === undefined && cacheRead > 0) {
      convertedUsage.cache_read_input_tokens = cacheRead;
    }
    if (convertedUsage.cache_creation_input_tokens === undefined && cacheCreate > 0) {
      convertedUsage.cache_creation_input_tokens = cacheCreate;
    }
    if (convertedUsage.prompt_tokens !== undefined && convertedUsage.input_tokens === undefined) {
      convertedUsage.input_tokens = Math.max(
        0,
        finiteTokenCount(convertedUsage.prompt_tokens) - cacheRead - cacheCreate
      );
    }
    if (
      convertedUsage.completion_tokens !== undefined &&
      convertedUsage.output_tokens === undefined
    ) {
      convertedUsage.output_tokens = convertedUsage.completion_tokens;
    }
  } else if (targetFormat === FORMATS.OPENAI_RESPONSES) {
    if (convertedUsage.prompt_tokens !== undefined && convertedUsage.input_tokens === undefined) {
      convertedUsage.input_tokens = convertedUsage.prompt_tokens;
    }
    if (
      convertedUsage.completion_tokens !== undefined &&
      convertedUsage.output_tokens === undefined
    ) {
      convertedUsage.output_tokens = convertedUsage.completion_tokens;
    }
    if (
      convertedUsage.input_tokens_details === undefined &&
      convertedUsage.prompt_tokens_details !== undefined
    ) {
      convertedUsage.input_tokens_details = convertedUsage.prompt_tokens_details;
    }
    const reasoning =
      convertedUsage.output_tokens_details?.reasoning_tokens ??
      convertedUsage.completion_tokens_details?.reasoning_tokens ??
      convertedUsage.reasoning_tokens;
    if (convertedUsage.output_tokens_details === undefined) {
      if (convertedUsage.completion_tokens_details !== undefined) {
        convertedUsage.output_tokens_details = convertedUsage.completion_tokens_details;
      } else if (typeof reasoning === "number" && reasoning > 0) {
        convertedUsage.output_tokens_details = { reasoning_tokens: reasoning };
      }
    } else if (
      convertedUsage.output_tokens_details.reasoning_tokens === undefined &&
      typeof reasoning === "number" &&
      reasoning > 0
    ) {
      convertedUsage.output_tokens_details = {
        ...convertedUsage.output_tokens_details,
        reasoning_tokens: reasoning,
      };
    }
  } else {
    if (convertedUsage.input_tokens !== undefined && convertedUsage.prompt_tokens === undefined) {
      convertedUsage.prompt_tokens =
        finiteTokenCount(convertedUsage.input_tokens) +
        getPromptCacheReadTokens(convertedUsage) +
        getPromptCacheCreationTokens(convertedUsage);
    }
    if (
      convertedUsage.output_tokens !== undefined &&
      convertedUsage.completion_tokens === undefined
    ) {
      convertedUsage.completion_tokens = convertedUsage.output_tokens;
    }
    if (
      convertedUsage.total_tokens === undefined &&
      convertedUsage.prompt_tokens !== undefined &&
      convertedUsage.completion_tokens !== undefined
    ) {
      convertedUsage.total_tokens = convertedUsage.prompt_tokens + convertedUsage.completion_tokens;
    }
  }

  // Helper to pick only defined fields from usage
  const pickFields = (fields) => {
    const filtered = {};
    for (const field of fields) {
      if (convertedUsage[field] !== undefined) {
        filtered[field] = convertedUsage[field];
      }
    }
    return filtered;
  };

  // Define allowed fields for each format
  const formatFields = {
    [FORMATS.CLAUDE]: [
      "input_tokens",
      "output_tokens",
      "cache_read_input_tokens",
      "cache_creation_input_tokens",
      "estimated",
    ],
    [FORMATS.GEMINI]: [
      "promptTokenCount",
      "candidatesTokenCount",
      "totalTokenCount",
      "cachedContentTokenCount",
      "thoughtsTokenCount",
      "estimated",
    ],
    [FORMATS.OPENAI_RESPONSES]: [
      "input_tokens",
      "output_tokens",
      "input_tokens_details",
      "output_tokens_details",
      "estimated",
    ],
    // OpenAI format (default for OPENAI, CODEX, KIRO, etc.)
    default: [
      "prompt_tokens",
      "completion_tokens",
      "total_tokens",
      "cached_tokens",
      "reasoning_tokens",
      "prompt_tokens_details",
      "completion_tokens_details",
      "estimated",
    ],
  };

  // Get fields for target format
  let fields = formatFields[targetFormat];

  // Use same fields for similar formats
  if (targetFormat === FORMATS.ANTIGRAVITY) {
    fields = formatFields[FORMATS.GEMINI];
  } else if (targetFormat === FORMATS.OPENAI_RESPONSE) {
    fields = formatFields[FORMATS.OPENAI_RESPONSES];
  } else if (!fields) {
    fields = formatFields.default;
  }

  return pickFields(fields);
}

/**
 * Normalize usage object - ensure all values are valid numbers
 */
export function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;

  type UsageDetails = Record<string, number>;
  type NormalizedUsage = {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    cached_tokens?: number;
    reasoning_tokens?: number;
    prompt_tokens_details?: UsageDetails;
    completion_tokens_details?: UsageDetails;
  };

  const normalized: NormalizedUsage = {};
  type NumericUsageKey = Exclude<
    keyof NormalizedUsage,
    "prompt_tokens_details" | "completion_tokens_details"
  >;
  const assignNumber = (key: NumericUsageKey, value: unknown) => {
    if (value === undefined || value === null) return;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) normalized[key] = numeric;
  };

  const normalizeDetails = (
    details: unknown,
    mapping: ReadonlyArray<readonly [string, string]>
  ): UsageDetails | undefined => {
    if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
    const detailRecord = details as Record<string, unknown>;
    const normalizedDetails: UsageDetails = {};
    for (const [fromKey, toKey] of mapping) {
      const value = detailRecord[fromKey];
      if (value === undefined || value === null) continue;
      const numeric = Number(value);
      if (Number.isFinite(numeric)) normalizedDetails[toKey] = numeric;
    }
    return Object.keys(normalizedDetails).length > 0 ? normalizedDetails : undefined;
  };

  assignNumber("prompt_tokens", usage?.prompt_tokens);
  assignNumber("completion_tokens", usage?.completion_tokens);
  assignNumber("total_tokens", usage?.total_tokens);
  assignNumber("cache_read_input_tokens", usage?.cache_read_input_tokens);
  assignNumber("cache_creation_input_tokens", usage?.cache_creation_input_tokens);
  assignNumber("cached_tokens", usage?.cached_tokens);
  assignNumber("reasoning_tokens", usage?.reasoning_tokens);

  const usageRecord = usage as Record<string, unknown> & {
    prompt_tokens_details?: Record<string, unknown>;
    completion_tokens_details?: Record<string, unknown>;
  };
  const promptDetails = normalizeDetails(usageRecord.prompt_tokens_details, [
    ["cached_tokens", "cached_tokens"],
    ["cache_creation_tokens", "cache_creation_tokens"],
    ["cache_write_tokens", "cache_write_tokens"],
    ["audio_tokens", "audio_tokens"],
  ]);
  if (promptDetails) normalized.prompt_tokens_details = promptDetails;

  const completionDetails = normalizeDetails(usageRecord.completion_tokens_details, [
    ["reasoning_tokens", "reasoning_tokens"],
    ["accepted_prediction_tokens", "accepted_prediction_tokens"],
    ["rejected_prediction_tokens", "rejected_prediction_tokens"],
    ["audio_tokens", "audio_tokens"],
  ]);
  if (completionDetails) normalized.completion_tokens_details = completionDetails;

  if (Object.keys(normalized).length === 0) return null;
  return normalized;
}

/**
 * Check if usage has valid token data
 * Valid = has at least one token field with value > 0
 * Invalid = empty object {}, null, undefined, no token fields, or all zeros
 */
export function hasValidUsage(usage) {
  if (!usage || typeof usage !== "object") return false;

  // Check for known token fields with value > 0
  const tokenFields = [
    "prompt_tokens",
    "completion_tokens",
    "total_tokens", // OpenAI
    "input_tokens",
    "output_tokens", // Claude
    "promptTokenCount",
    "candidatesTokenCount", // Gemini
  ];

  for (const field of tokenFields) {
    if (typeof usage[field] === "number" && usage[field] > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Extract usage from supported formats (Claude, OpenAI, Gemini, Responses API)
 */
export function extractUsage(chunk) {
  if (!chunk || typeof chunk !== "object") return null;

  // Claude/Antigravity streaming: message_start event carries INPUT tokens
  // FIX #74: This event was not handled — input_tokens were being dropped
  // Structure: { type: "message_start", message: { usage: { input_tokens: N, output_tokens: 0 } } }
  if (chunk.type === "message_start" && chunk.message?.usage) {
    const u = chunk.message.usage;
    const inputTokens = u.input_tokens || u.prompt_tokens || 0;
    const cacheReadTokens = u.cache_read_input_tokens || 0;
    const cacheCreationTokens = u.cache_creation_input_tokens || 0;
    const totalPromptTokens = inputTokens + cacheReadTokens + cacheCreationTokens;
    if (totalPromptTokens > 0) {
      return normalizeUsage({
        prompt_tokens: totalPromptTokens,
        completion_tokens: u.output_tokens || u.completion_tokens || 0,
        cache_read_input_tokens: u.cache_read_input_tokens,
        cache_creation_input_tokens: u.cache_creation_input_tokens,
      });
    }
  }

  // Claude format (message_delta event) — carries OUTPUT tokens
  if (chunk.type === "message_delta" && chunk.usage && typeof chunk.usage === "object") {
    const inputTokens = chunk.usage.input_tokens || 0;
    const cacheReadTokens = chunk.usage.cache_read_input_tokens || 0;
    const cacheCreationTokens = chunk.usage.cache_creation_input_tokens || 0;
    return normalizeUsage({
      prompt_tokens: inputTokens + cacheReadTokens + cacheCreationTokens,
      completion_tokens: chunk.usage.output_tokens || 0,
      cache_read_input_tokens: chunk.usage.cache_read_input_tokens,
      cache_creation_input_tokens: chunk.usage.cache_creation_input_tokens,
    });
  }

  // OpenAI Responses API format (response.completed or response.done)
  if (
    (chunk.type === "response.completed" || chunk.type === "response.done") &&
    chunk.response?.usage &&
    typeof chunk.response.usage === "object"
  ) {
    const usage = chunk.response.usage;
    return normalizeUsage({
      prompt_tokens: usage.input_tokens || usage.prompt_tokens || 0,
      completion_tokens: usage.output_tokens || usage.completion_tokens || 0,
      cached_tokens: usage.input_tokens_details?.cached_tokens,
      reasoning_tokens: usage.output_tokens_details?.reasoning_tokens,
      prompt_tokens_details: usage.input_tokens_details
        ? {
            cached_tokens: usage.input_tokens_details.cached_tokens,
            cache_creation_tokens: usage.input_tokens_details.cache_creation_tokens,
            cache_write_tokens: usage.input_tokens_details.cache_write_tokens,
            audio_tokens: usage.input_tokens_details.audio_tokens,
          }
        : undefined,
      completion_tokens_details: usage.output_tokens_details
        ? {
            reasoning_tokens: usage.output_tokens_details.reasoning_tokens,
            audio_tokens: usage.output_tokens_details.audio_tokens,
            accepted_prediction_tokens: usage.output_tokens_details.accepted_prediction_tokens,
            rejected_prediction_tokens: usage.output_tokens_details.rejected_prediction_tokens,
          }
        : undefined,
    });
  }

  // OpenAI format
  if (
    chunk.usage &&
    typeof chunk.usage === "object" &&
    (chunk.usage.prompt_tokens !== undefined || chunk.usage.input_tokens !== undefined)
  ) {
    const chunkUsage = chunk.usage as Record<string, unknown> & {
      prompt_tokens?: unknown;
      input_tokens?: unknown;
      completion_tokens?: unknown;
      output_tokens?: unknown;
      prompt_tokens_details?: Record<string, unknown>;
      completion_tokens_details?: Record<string, unknown>;
    };
    return normalizeUsage({
      prompt_tokens: chunkUsage.prompt_tokens ?? chunkUsage.input_tokens ?? 0,
      completion_tokens: chunkUsage.completion_tokens ?? chunkUsage.output_tokens ?? 0,
      cached_tokens: chunkUsage.prompt_tokens_details?.cached_tokens,
      reasoning_tokens: chunkUsage.completion_tokens_details?.reasoning_tokens,
      prompt_tokens_details: chunkUsage.prompt_tokens_details,
      completion_tokens_details: chunkUsage.completion_tokens_details,
    });
  }

  // Gemini format (Antigravity)
  if (chunk.usageMetadata && typeof chunk.usageMetadata === "object") {
    return normalizeUsage({
      prompt_tokens: chunk.usageMetadata?.promptTokenCount || 0,
      completion_tokens: chunk.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: chunk.usageMetadata?.totalTokenCount,
      cached_tokens: chunk.usageMetadata?.cachedContentTokenCount,
      reasoning_tokens: chunk.usageMetadata?.thoughtsTokenCount,
    });
  }

  return null;
}

// Heuristic token estimation constants
const CHARS_PER_TOKEN_SCHEMA = 6; // ~6 chars/token for JSON schemas (more verbose per token)
/** Anthropic-style flat cost for one image block. Base64 is not text. */
export const ESTIMATED_IMAGE_TOKENS = 2000;
const BASE64_MIN_CHARS = 8000;

/**
 * Improved token estimation heuristic (no dependency).
 * Splits text on common token boundaries (whitespace, punctuation, camelCase)
 * and applies a sub-word correction factor. Better accuracy for:
 * - English text (~4 chars/token)
 * - CJK text (~1 char/token for ideographs)
 * - Code (~3.5 chars/token, more punctuation-heavy)
 *
 * @param {string} text - Text to estimate tokens for
 * @returns {number} Estimated token count
 */
function estimateTokenCount(text) {
  if (!text || typeof text !== "string") return 0;

  // Count CJK ideographs separately — each is roughly 1 token
  const cjkMatches = text.match(/[\u3000-\u9fff\uf900-\ufaff\u{20000}-\u{2fa1f}]/gu);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;

  // Remove CJK chars for the remaining estimation
  const nonCJK = text.replace(/[\u3000-\u9fff\uf900-\ufaff]/g, " ");

  // Split on token boundaries: whitespace, punctuation, camelCase transitions
  const tokens = nonCJK
    .split(/(\s+|[^\w\s]|(?<=[a-z])(?=[A-Z]))/)
    .filter((t) => t && t.trim().length > 0);

  // Apply sub-word correction: BPE tokenizers often split long words
  // into sub-word pieces, so raw token count underestimates slightly
  const estimatedNonCJK = Math.ceil(tokens.length * 1.3);

  return cjkCount + estimatedNonCJK;
}

function isBase64Blob(text: string): boolean {
  if (/^data:[^;,\s]+;base64,/i.test(text)) return true;
  if (text.length < BASE64_MIN_CHARS) return false;
  const head = text.slice(0, 120).replace(/\s+/g, "");
  return /^[A-Za-z0-9+/=]+$/.test(head);
}

function estimateTextTokens(text: unknown): number {
  if (typeof text !== "string" || !text) return 0;
  if (isBase64Blob(text)) return ESTIMATED_IMAGE_TOKENS;
  return estimateTokenCount(text);
}

function estimateContentTokens(content: unknown): number {
  if (!content) return 0;
  if (typeof content === "string") return estimateTextTokens(content);
  if (!Array.isArray(content)) return 0;
  let total = 0;
  for (const part of content) {
    if (!part || typeof part !== "object") {
      total += estimateTextTokens(String(part));
      continue;
    }
    const block = part as Record<string, unknown>;
    const type = block.type;
    if (type === "image" || type === "image_url" || type === "input_image") {
      total += ESTIMATED_IMAGE_TOKENS;
      continue;
    }
    if (typeof block.text === "string") total += estimateTextTokens(block.text);
    if (typeof block.thinking === "string") total += estimateTokenCount(block.thinking);
    if (typeof block.image_url === "string") total += ESTIMATED_IMAGE_TOKENS;
    else if (block.image_url && typeof block.image_url === "object") {
      const url = (block.image_url as Record<string, unknown>).url;
      total += typeof url === "string" && url.startsWith("data:") ? ESTIMATED_IMAGE_TOKENS : 0;
    }
    if (block.input) {
      total +=
        typeof block.input === "string"
          ? estimateTextTokens(block.input)
          : estimateTokenCount(JSON.stringify(block.input));
    }
    if (block.content) total += estimateContentTokens(block.content);
  }
  return total;
}

function estimateSystemTokens(system: unknown): number {
  if (!system) return 0;
  if (typeof system === "string") return estimateTextTokens(system);
  if (!Array.isArray(system)) return 0;
  let total = 0;
  for (const block of system) {
    if (typeof block === "string") total += estimateTextTokens(block);
    else if (
      block &&
      typeof block === "object" &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      total += estimateTextTokens((block as { text: string }).text);
    }
  }
  return total;
}

function estimateToolSchemaTokens(tools: unknown): number {
  if (!Array.isArray(tools) || tools.length === 0) return 0;
  try {
    return Math.ceil(JSON.stringify(tools).length / CHARS_PER_TOKEN_SCHEMA);
  } catch {
    return 0;
  }
}

export type EstimateInputTokenOptions = {
  /** Skip messages — used for Claude Code compact so the meter drops to the surviving floor. */
  excludeMessages?: boolean;
};

/**
 * Estimate input tokens from request body.
 * Counts system text, message text, and tool schemas. Image / base64 blocks
 * use a flat image cost instead of treating PNG bytes as language tokens.
 */
export function estimateInputTokens(body, options: EstimateInputTokenOptions = {}) {
  if (!body || typeof body !== "object") return 0;

  try {
    let total = estimateToolSchemaTokens(body.tools);
    total += estimateSystemTokens(body.system || body.instructions);
    if (options.excludeMessages) return total;

    if (Array.isArray(body.messages)) {
      for (const message of body.messages) {
        if (!message || typeof message !== "object") continue;
        total += estimateContentTokens(message.content);
        total += 4;
      }
    }

    if (Array.isArray(body.input)) {
      for (const item of body.input) {
        if (!item || typeof item !== "object") continue;
        if (item.content !== undefined) {
          total += estimateContentTokens(item.content);
        }
        if (typeof item.arguments === "string") {
          total += Math.ceil(item.arguments.length / 3.5);
        }
        if (typeof item.output === "string") {
          total += Math.ceil(item.output.length / 3.5);
        }
        total += 4;
      }
    }

    return total;
  } catch {
    return 0;
  }
}
/**
 * Estimate output tokens from content length.
 * Uses improved heuristic when possible, falls back to length-based estimation.
 */
export function estimateOutputTokens(contentLength) {
  if (!contentLength || contentLength <= 0) return 0;
  // When we only have a character count, use 4 chars/token with sub-word correction
  return Math.max(1, Math.ceil(contentLength / 3.5));
}

/**
 * Format usage object based on target format
 * @param {number} inputTokens - Input/prompt tokens
 * @param {number} outputTokens - Output/completion tokens
 * @param {string} targetFormat - Target format from FORMATS
 */
export function formatUsage(inputTokens, outputTokens, targetFormat) {
  // Claude format uses input_tokens/output_tokens
  if (targetFormat === FORMATS.CLAUDE) {
    return addBufferToUsage({
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      estimated: true,
    });
  }

  // Default: OpenAI format (works for openai, gemini, responses, etc.)
  return addBufferToUsage({
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    estimated: true,
  });
}

/**
 * Estimate full usage when provider doesn't return it
 * @param {object} body - Request body for input token estimation
 * @param {number} contentLength - Content length for output token estimation
 * @param {string} targetFormat - Target format from FORMATS constant
 */
export function estimateUsage(body, contentLength, targetFormat = FORMATS.OPENAI) {
  return formatUsage(estimateInputTokens(body), estimateOutputTokens(contentLength), targetFormat);
}

/**
 * Log usage with cache info (green color)
 */
export function logUsage(provider, usage, _model = null, connectionId = null, _apiKeyInfo = null) {
  if (!usage || typeof usage !== "object") return;

  const p = provider?.toUpperCase() || "UNKNOWN";

  // Support both formats:
  // - OpenAI: prompt_tokens, completion_tokens
  // - Claude: input_tokens, output_tokens
  const inTokens = getLoggedInputTokens(usage);
  const outTokens = getLoggedOutputTokens(usage);
  const accountPrefix = connectionId ? connectionId.slice(0, 8) + "..." : "unknown";

  let msg = `[${getTimeString()}] 📊 ${COLORS.green}[USAGE] ${p} | in=${inTokens} | out=${outTokens} | account=${accountPrefix}${COLORS.reset}`;

  // Add estimated flag if present
  if (usage.estimated) {
    msg += ` ${COLORS.yellow}(estimated)${COLORS.reset}`;
  }

  // Add cache info if present (unified from different formats)
  const cacheRead = getPromptCacheReadTokens(usage);
  if (cacheRead) msg += ` | cache_read=${cacheRead}`;

  const cacheCreation = getPromptCacheCreationTokens(usage);
  if (cacheCreation) msg += ` | cache_create=${cacheCreation}`;

  const reasoning = usage.reasoning_tokens;
  if (reasoning) msg += ` | reasoning=${reasoning}`;

  console.log(msg);

  // Streaming requests persist usage once in chatCore's completion callback.
  // Keep this helper side-effect free apart from console visibility.
}
