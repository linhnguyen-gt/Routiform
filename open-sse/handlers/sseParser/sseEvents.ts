/**
 * Convert OpenAI-style SSE chunks into a single non-streaming JSON response.
 * Used as a fallback when upstream returns text/event-stream for stream=false.
 */
function readSSEEvents(rawSSE) {
  const lines = String(rawSSE || "").split("\n");
  const events = [];
  let currentEvent = "";
  let currentData = [];

  const flush = () => {
    if (currentData.length === 0) {
      currentEvent = "";
      return;
    }

    const payload = currentData.join("\n").trim();
    currentData = [];
    if (!payload || payload === "[DONE]") {
      currentEvent = "";
      return;
    }

    try {
      events.push({
        event: currentEvent || undefined,
        data: JSON.parse(payload),
      });
    } catch {
      // Ignore malformed SSE events and continue best-effort parsing.
    }

    currentEvent = "";
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    if (line.trim() === "") {
      flush();
      continue;
    }

    if (line.startsWith("event:")) {
      currentEvent = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      currentData.push(line.slice(5).trimStart());
    }
  }

  flush();
  return events;
}

/**
 * Collect OpenAI-style stream JSON objects. Prefer RFC SSE parsing (handles multi-line `data:` payloads);
 * fall back to one `data:` line = one JSON object (common OpenAI/Cline stream).
 */
function collectOpenAIChatCompletionChunks(rawSSE) {
  const events = readSSEEvents(rawSSE);
  const fromEvents = events
    .map((e) => e.data)
    .filter((d) => d != null && typeof d === "object" && !Array.isArray(d));
  if (fromEvents.length > 0) return fromEvents;

  const lines = String(rawSSE || "").split("\n");
  const chunks = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      chunks.push(JSON.parse(payload));
    } catch {
      // Ignore malformed SSE lines and continue best-effort parsing.
    }
  }
  return chunks;
}

export { readSSEEvents, collectOpenAIChatCompletionChunks };
