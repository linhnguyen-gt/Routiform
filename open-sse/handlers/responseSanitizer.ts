import { unwrapOpenAIChatCompletionRoot } from "../utils/chatCompletionEnvelope.ts";

/**
 * Response Sanitizer — Normalizes LLM responses to strict OpenAI SDK format.
 *
 * Fixes Issues:
 * 1. Strips non-standard fields (for example x_groq, usage_breakdown) that
 *    break strict OpenAI SDK validation
 * 2. Extracts <think> tags from thinking models into reasoning_content
 * 3. Normalizes response id, object, and usage fields
 * 4. Preserves official OpenAI chat-completions fields like service_tier
 */

const ALLOWED_USAGE_FIELDS = new Set([
  "prompt_tokens",
  "completion_tokens",
  "total_tokens",
  "prompt_tokens_details",
  "completion_tokens_details",
]);

type JsonRecord = Record<string, unknown>;

function toRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function toString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// Matches <think>...</think> blocks and <thinking>...</thinking> (greedy, dotAll)
const THINK_TAG_REGEX = /<(?:think|thinking)>([\s\S]*?)<\/(?:think|thinking)>/gi;

// #638, #727: Collapse runs of 2+ consecutive newlines into \n\n
// Tool call responses from thinking models often accumulate excessive newlines
const EXCESSIVE_NEWLINES = /\n{2,}/g;
function collapseExcessiveNewlines(text: string): string {
  return text.replace(EXCESSIVE_NEWLINES, "\n\n");
}

/**
 * Extract <think> blocks from text content and return separated parts.
 * @returns {{ content: string, thinking: string | null }}
 */
export function extractThinkingFromContent(text: string): {
  content: string;
  thinking: string | null;
} {
  if (!text || typeof text !== "string") {
    return { content: text || "", thinking: null };
  }

  const thinkingParts: string[] = [];
  let hasThinkTags = false;

  const cleaned = text.replace(THINK_TAG_REGEX, (_, thinkContent) => {
    hasThinkTags = true;
    const trimmed = thinkContent.trim();
    if (trimmed) {
      thinkingParts.push(trimmed);
    }
    return "";
  });

  if (!hasThinkTags) {
    return { content: text, thinking: null };
  }

  return {
    content: cleaned.trim(),
    thinking: thinkingParts.length > 0 ? thinkingParts.join("\n\n") : null,
  };
}

/**
 * Sanitize a non-streaming OpenAI ChatCompletion response.
 * Strips non-standard fields and normalizes required fields.
 */
export function sanitizeOpenAIResponse(body: unknown): unknown {
  const bodyRecord = toRecord(body);
  if (!bodyRecord) return body;

  const root = unwrapOpenAIChatCompletionRoot(bodyRecord);

  // Build sanitized response with only allowed top-level fields
  const sanitized: JsonRecord = {};

  // Ensure required fields exist
  sanitized.id = normalizeResponseId(root.id);
  sanitized.object = toString(root.object) || "chat.completion";
  sanitized.created = toNumber(root.created) ?? Math.floor(Date.now() / 1000);
  sanitized.model = toString(root.model) || "unknown";

  // Sanitize choices
  if (Array.isArray(root.choices)) {
    sanitized.choices = root.choices.map((choice, idx) => sanitizeChoice(choice, idx));
  } else {
    sanitized.choices = [];
  }

  // Sanitize usage
  if (root.usage !== undefined) {
    sanitized.usage = sanitizeUsage(root.usage);
  }

  // Keep system_fingerprint if present (it's a valid OpenAI field)
  if (root.system_fingerprint) {
    sanitized.system_fingerprint = root.system_fingerprint;
  }

  // Keep service_tier if present (official OpenAI field)
  if (root.service_tier !== undefined) {
    sanitized.service_tier = root.service_tier;
  }

  return sanitized;
}

/**
 * Sanitize a single choice object.
 */
function sanitizeChoice(choice: unknown, defaultIndex: number): JsonRecord {
  const choiceRecord = toRecord(choice);
  const sanitized: JsonRecord = {
    index: defaultIndex,
    finish_reason: null,
  };

  if (choiceRecord?.index !== undefined) {
    sanitized.index = choiceRecord.index;
  }

  if (choiceRecord?.finish_reason !== undefined) {
    sanitized.finish_reason = choiceRecord.finish_reason;
  }

  // Sanitize message (non-streaming) or delta (streaming)
  if (choiceRecord?.message !== undefined) {
    sanitized.message = sanitizeMessage(choiceRecord.message);
  }
  if (choiceRecord?.delta !== undefined) {
    sanitized.delta = sanitizeMessage(choiceRecord.delta);
  }

  // Keep logprobs if present
  if (choiceRecord?.logprobs !== undefined) {
    sanitized.logprobs = choiceRecord.logprobs;
  }

  return sanitized;
}

/**
 * Sanitize a message object, extracting <think> tags if present.
 */
function sanitizeMessage(msg: unknown): unknown {
  const msgRecord = toRecord(msg);
  if (!msgRecord) return msg;

  const sanitized: JsonRecord = {};

  // Copy only allowed fields
  if (msgRecord.role) sanitized.role = msgRecord.role;
  if (msgRecord.refusal !== undefined) sanitized.refusal = msgRecord.refusal;

  // Handle content — extract <think> tags
  if (typeof msgRecord.content === "string") {
    const { content, thinking } = extractThinkingFromContent(msgRecord.content);
    sanitized.content = collapseExcessiveNewlines(content);

    // Set reasoning_content from <think> tags (if not already set)
    if (thinking && !msgRecord.reasoning_content) {
      sanitized.reasoning_content = thinking;
    }
  } else if (msgRecord.content !== undefined) {
    sanitized.content = msgRecord.content;
  }

  // Preserve existing reasoning_content (from providers that natively support it)
  if (msgRecord.reasoning_content && !sanitized.reasoning_content) {
    sanitized.reasoning_content = msgRecord.reasoning_content;
  }

  // Handle 'reasoning' field alias (some providers use this instead of reasoning_content)
  if (
    msgRecord.reasoning &&
    typeof msgRecord.reasoning === "string" &&
    !sanitized.reasoning_content
  ) {
    sanitized.reasoning_content = msgRecord.reasoning;
  }

  // Handle reasoning_details[] array (StepFun/OpenRouter format)
  // Structure: [{ type: "reasoning.text", text: "...", format: "unknown", index: 0 }]
  if (Array.isArray(msgRecord.reasoning_details) && !sanitized.reasoning_content) {
    const reasoningParts: string[] = [];
    for (const detail of msgRecord.reasoning_details) {
      const detailObj = detail && typeof detail === "object" ? (detail as JsonRecord) : null;
      if (!detailObj) continue;
      const detailType = typeof detailObj.type === "string" ? detailObj.type : "";
      const detailText =
        typeof detailObj.text === "string"
          ? detailObj.text
          : typeof detailObj.content === "string"
            ? detailObj.content
            : "";
      if (
        detailText &&
        (detailType === "reasoning" ||
          detailType === "reasoning.text" ||
          detailType === "thinking" ||
          detailType === "")
      ) {
        reasoningParts.push(detailText);
      }
    }
    if (reasoningParts.length > 0) {
      sanitized.reasoning_content = reasoningParts.join("");
    }
  }

  // Preserve tool_calls
  if (msgRecord.tool_calls) {
    sanitized.tool_calls = msgRecord.tool_calls;
  }

  // Preserve function_call (legacy)
  if (msgRecord.function_call) {
    sanitized.function_call = msgRecord.function_call;
  }

  return sanitized;
}

/**
 * Sanitize usage object — keep only standard fields.
 */
function sanitizeUsage(usage: unknown): unknown {
  const usageRecord = toRecord(usage);
  if (!usageRecord) return usage;

  const sanitized: JsonRecord = {};

  // Cross-map Claude-style → OpenAI-style field names.
  // Some providers return input_tokens/output_tokens instead of prompt_tokens/completion_tokens.
  // Without this mapping, the whitelist filter below strips them, resulting in NaN/0 tokens (#617).
  if (usageRecord.input_tokens !== undefined && usageRecord.prompt_tokens === undefined) {
    usageRecord.prompt_tokens = usageRecord.input_tokens;
  }
  if (usageRecord.output_tokens !== undefined && usageRecord.completion_tokens === undefined) {
    usageRecord.completion_tokens = usageRecord.output_tokens;
  }

  for (const key of ALLOWED_USAGE_FIELDS) {
    if (usageRecord[key] !== undefined) {
      sanitized[key] = usageRecord[key];
    }
  }

  // Ensure required fields
  const promptTokens = toNumber(sanitized.prompt_tokens) ?? 0;
  const completionTokens = toNumber(sanitized.completion_tokens) ?? 0;
  const totalTokens = toNumber(sanitized.total_tokens) ?? promptTokens + completionTokens;

  sanitized.prompt_tokens = promptTokens;
  sanitized.completion_tokens = completionTokens;
  sanitized.total_tokens = totalTokens;

  return sanitized;
}

/**
 * Normalize response ID to use chatcmpl- prefix.
 */
function normalizeResponseId(id: unknown): string {
  if (!id || typeof id !== "string") {
    return `chatcmpl-${crypto.randomUUID().replace(/-/g, "").slice(0, 29)}`;
  }
  // Already correct format
  if (id.startsWith("chatcmpl-")) return id;
  // Keep custom IDs but don't break them
  return id;
}

/**
 * Sanitize a streaming SSE chunk for passthrough mode.
 * Lighter than full sanitization — only strips problematic extra fields.
 */
export function sanitizeStreamingChunk(parsed: unknown): unknown {
  const parsedRecord = toRecord(parsed);
  if (!parsedRecord) return parsed;

  // Build sanitized chunk
  const sanitized: JsonRecord = {};

  // Keep only standard fields
  if (parsedRecord.id !== undefined) sanitized.id = parsedRecord.id;
  sanitized.object = toString(parsedRecord.object) || "chat.completion.chunk";
  if (parsedRecord.created !== undefined) sanitized.created = parsedRecord.created;
  if (parsedRecord.model !== undefined) sanitized.model = parsedRecord.model;

  // Sanitize choices with delta
  if (Array.isArray(parsedRecord.choices)) {
    sanitized.choices = parsedRecord.choices.map((choice) => {
      const c: JsonRecord = { index: 0 };
      const choiceRecord = toRecord(choice);
      if (!choiceRecord) return c;

      c.index = toNumber(choiceRecord.index) ?? 0;

      if (choiceRecord.delta !== undefined) {
        const deltaRecord = toRecord(choiceRecord.delta);
        if (deltaRecord) {
          const delta: JsonRecord = {};
          if (deltaRecord.role !== undefined) delta.role = deltaRecord.role;
          if (deltaRecord.content !== undefined) {
            delta.content =
              typeof deltaRecord.content === "string"
                ? collapseExcessiveNewlines(deltaRecord.content)
                : deltaRecord.content;
          }
          if (deltaRecord.reasoning_content !== undefined) {
            delta.reasoning_content = deltaRecord.reasoning_content;
          } else if (typeof deltaRecord.reasoning === "string" && deltaRecord.reasoning) {
            // Alias: some providers use 'reasoning' instead of 'reasoning_content'
            delta.reasoning_content = deltaRecord.reasoning;
          } else if (Array.isArray(deltaRecord.reasoning_details)) {
            // StepFun/OpenRouter: reasoning_details[{type:"reasoning.text", text:"..."}]
            const parts: string[] = [];
            for (const detail of deltaRecord.reasoning_details) {
              const d = detail && typeof detail === "object" ? (detail as JsonRecord) : null;
              if (!d) continue;
              const text =
                typeof d.text === "string"
                  ? d.text
                  : typeof d.content === "string"
                    ? d.content
                    : "";
              if (text) parts.push(text);
            }
            if (parts.length > 0) {
              delta.reasoning_content = parts.join("");
            }
          }
          if (deltaRecord.refusal !== undefined) delta.refusal = deltaRecord.refusal;
          if (deltaRecord.tool_calls !== undefined) delta.tool_calls = deltaRecord.tool_calls;
          if (deltaRecord.function_call !== undefined)
            delta.function_call = deltaRecord.function_call;
          c.delta = delta;
        } else {
          c.delta = choiceRecord.delta;
        }
      }

      if (choiceRecord.finish_reason !== undefined) c.finish_reason = choiceRecord.finish_reason;
      if (choiceRecord.logprobs !== undefined) c.logprobs = choiceRecord.logprobs;
      return c;
    });
  }

  // Sanitize usage if present
  if (parsedRecord.usage !== undefined) {
    sanitized.usage = sanitizeUsage(parsedRecord.usage);
  }

  // Keep system_fingerprint if present
  if (parsedRecord.system_fingerprint) {
    sanitized.system_fingerprint = parsedRecord.system_fingerprint;
  }

  // Keep service_tier if present (official OpenAI field)
  if (parsedRecord.service_tier !== undefined) {
    sanitized.service_tier = parsedRecord.service_tier;
  }

  return sanitized;
}
