import {
  collectResponsesStreamedText,
  mergeStreamedTextIntoOutput,
} from "../../utils/responses-output-text.ts";

/**
 * Convert Responses API SSE events into a single non-streaming response object.
 * Expects events such as response.created / response.in_progress / response.completed.
 */
export function parseSSEToResponsesOutput(rawSSE, fallbackModel) {
  const lines = String(rawSSE || "").split("\n");
  const events = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      events.push(JSON.parse(payload));
    } catch {
      // Ignore malformed lines and continue best-effort parsing.
    }
  }

  if (events.length === 0) return null;

  let completed = null;
  let latestResponse = null;

  for (const evt of events) {
    if (evt?.type === "response.completed" && evt.response) {
      completed = evt.response;
    }
    if (evt?.response && typeof evt.response === "object") {
      latestResponse = evt.response;
    } else if (evt?.object === "response") {
      latestResponse = evt;
    }
  }

  const picked = completed || latestResponse;
  if (!picked || typeof picked !== "object") return null;

  // Codex reports `output: []` on `response.completed` and streams the reply as
  // `response.output_text.delta` instead — see ../utils/responses-output-text.ts.
  const streamedText = collectResponsesStreamedText(events);

  // Build the native response object preserving all known fields.
  // Prefer additive preservation over destructive normalization — keep
  // whatever the upstream sends so that Responses-oriented clients receive
  // payloads closer to the native OpenAI Responses API shape.
  const result: Record<string, unknown> = {
    id: picked.id || `resp_${Date.now()}`,
    object: "response",
    model: picked.model || fallbackModel || "unknown",
    output: mergeStreamedTextIntoOutput(picked.output, streamedText),
    status: picked.status || (completed ? "completed" : "in_progress"),
    created_at: picked.created_at || Math.floor(Date.now() / 1000),
  };

  // Preserve usage when present (include richer nested detail if the upstream provides it).
  if (picked.usage != null) {
    result.usage = picked.usage;
  }

  // Preserve error field — even null is intentional and should be forwarded.
  if ("error" in picked) {
    result.error = picked.error;
  }

  // Preserve incomplete_details when the upstream signals a partial / truncated response.
  if (picked.incomplete_details != null) {
    result.incomplete_details = picked.incomplete_details;
  }

  // Preserve metadata object (may carry provider-specific tags).
  if (picked.metadata != null && typeof picked.metadata === "object") {
    result.metadata = picked.metadata;
  } else {
    result.metadata = {};
  }

  // Preserve additional native state/metadata fields if present.
  // These are forwarded as-is so that clients that understand them keep fidelity.
  const passthroughFields = [
    "background",
    "parallel_tool_calls",
    "previous_response_id",
    "temperature",
    "top_p",
    "max_output_tokens",
    "truncation",
    "instructions",
    "text",
    "tool_choice",
    "tools",
    "store",
    "service_tier",
  ];
  for (const field of passthroughFields) {
    if (field in picked && picked[field] !== undefined) {
      result[field] = picked[field];
    }
  }

  return result;
}
