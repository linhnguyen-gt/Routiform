export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
  published_at?: string | null;
};

function srvtooluId(): string {
  return `srvtoolu_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function toWebSearchResults(hits: SearchHit[]) {
  return hits
    .filter((h) => typeof h.url === "string" && h.url.startsWith("http"))
    .map((h) => ({
      type: "web_search_result",
      url: h.url,
      title: h.title || h.url,
      encrypted_content: h.snippet || h.title || h.url,
      page_age: h.published_at || null,
    }));
}

export function claudeSearchMessage(model: string, query: string, hits: SearchHit[]) {
  const toolId = srvtooluId();
  const results = toWebSearchResults(hits);
  const summary = formatSearchText(query, "web_search", hits);
  return {
    id: `msg_web_${Date.now()}`,
    type: "message",
    role: "assistant",
    model,
    content: [
      { type: "server_tool_use", id: toolId, name: "web_search", input: { query } },
      { type: "web_search_tool_result", tool_use_id: toolId, content: results },
      { type: "text", text: summary },
    ],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: Math.max(1, Math.ceil(summary.length / 4)),
      server_tool_use: { web_search_requests: 1 },
    },
  };
}

export function claudeFetchMessage(model: string, url: string, text: string) {
  const toolId = srvtooluId();
  const retrievedAt = new Date().toISOString();
  return {
    id: `msg_web_${Date.now()}`,
    type: "message",
    role: "assistant",
    model,
    content: [
      { type: "server_tool_use", id: toolId, name: "web_fetch", input: { url } },
      {
        type: "web_fetch_tool_result",
        tool_use_id: toolId,
        content: {
          type: "web_fetch_result",
          url,
          retrieved_at: retrievedAt,
          content: {
            type: "document",
            source: { type: "text", media_type: "text/plain", data: text },
            title: url,
          },
        },
      },
    ],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: Math.max(1, Math.ceil(text.length / 4)),
      server_tool_use: { web_fetch_requests: 1 },
    },
  };
}

export function claudeFetchSse(model: string, url: string, text: string): string {
  const msg = claudeFetchMessage(model, url, text);
  const id = msg.id;
  const blocks = msg.content as Array<Record<string, unknown>>;
  const parts = [
    `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id, type: "message", role: "assistant", model, content: [], stop_reason: null, usage: { input_tokens: 0, output_tokens: 0 } } })}\n\n`,
  ];
  blocks.forEach((block, index) => {
    parts.push(
      `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index, content_block: block })}\n\n`
    );
    parts.push(
      `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index })}\n\n`
    );
  });
  parts.push(
    `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1, server_tool_use: { web_fetch_requests: 1 } } })}\n\n`
  );
  parts.push(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);
  return parts.join("");
}

export function claudeSearchSse(model: string, query: string, hits: SearchHit[]): string {
  const msg = claudeSearchMessage(model, query, hits);
  const id = msg.id;
  const blocks = msg.content as Array<Record<string, unknown>>;
  const parts = [
    `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id, type: "message", role: "assistant", model, content: [], stop_reason: null, usage: { input_tokens: 0, output_tokens: 0 } } })}\n\n`,
  ];
  blocks.forEach((block, index) => {
    parts.push(
      `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index, content_block: block })}\n\n`
    );
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(
        `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } })}\n\n`
      );
    }
    parts.push(
      `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index })}\n\n`
    );
  });
  parts.push(
    `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1, server_tool_use: { web_search_requests: 1 } } })}\n\n`
  );
  parts.push(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);
  return parts.join("");
}

export function formatSearchText(
  query: string,
  provider: string,
  results: Array<{ title: string; url: string; snippet: string }>
): string {
  if (results.length === 0) {
    return `No web search results for "${query}" (via ${provider}).`;
  }
  const lines = results.map((r, i) => {
    const snippet = r.snippet ? `\n   ${r.snippet}` : "";
    return `${i + 1}. ${r.title}\n   ${r.url}${snippet}`;
  });
  return `Web search results for "${query}" via ${provider}:\n\n${lines.join("\n\n")}`;
}

export function claudeMessage(model: string, text: string) {
  return {
    id: `msg_web_${Date.now()}`,
    type: "message",
    role: "assistant",
    model,
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: Math.max(1, Math.ceil(text.length / 4)) },
  };
}

export function openaiMessage(model: string, text: string) {
  return {
    id: `chatcmpl-web-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: Math.max(1, Math.ceil(text.length / 4)),
      total_tokens: Math.max(1, Math.ceil(text.length / 4)),
    },
  };
}

export function claudeSse(model: string, text: string): string {
  const id = `msg_web_${Date.now()}`;
  const start = {
    type: "message_start",
    message: {
      id,
      type: "message",
      role: "assistant",
      model,
      content: [],
      stop_reason: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  };
  return [
    `event: message_start\ndata: ${JSON.stringify(start)}\n\n`,
    `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
    `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })}\n\n`,
    `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
    `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } })}\n\n`,
    `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
  ].join("");
}

export function openaiSse(model: string, text: string): string {
  const id = `chatcmpl-web-${Date.now()}`;
  const chunk = (delta: Record<string, unknown>, finish: string | null = null) =>
    `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  return `${chunk({ role: "assistant", content: "" })}${chunk({ content: text })}${chunk({}, "stop")}data: [DONE]\n\n`;
}

export function webToolHttpResponse(body: unknown, stream = false): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": stream ? "text/event-stream; charset=utf-8" : "application/json",
      "Cache-Control": "no-cache",
    },
  });
}
