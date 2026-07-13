import { streamText, convertToModelMessages, type UIMessage } from "ai";

import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { createErrorResponse } from "@/lib/api/errorResponse";
import { createRouterTurn } from "@/lib/chat/router-client";
import { appendMessage, getConversation, updateConversation, updateMessage } from "@/lib/db/chat";

export const dynamic = "force-dynamic";

interface ChatRequestBody {
  conversationId?: unknown;
  messages?: unknown;
  model?: unknown;
  provider?: unknown;
}

function isUIMessageArray(value: unknown): value is UIMessage[] {
  return Array.isArray(value) && value.every((m) => typeof m === "object" && m !== null);
}

export async function POST(request: Request): Promise<Response> {
  // Cookie-session only. Deliberately NOT the blanket proxy.ts check, which
  // accepts any router API key as a Bearer token (shared/utils/apiAuth.ts) —
  // a key handed to a coding agent for LLM routing must not also read the
  // user's chat history.
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return createErrorResponse({
      status: 400,
      message: "Invalid JSON body",
      type: "invalid_request",
    });
  }

  const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
  if (!conversationId) {
    return createErrorResponse({
      status: 400,
      message: "conversationId is required",
      type: "invalid_request",
    });
  }

  const conversation = getConversation(conversationId);
  if (!conversation) {
    return createErrorResponse({
      status: 404,
      message: "Conversation not found",
      type: "invalid_request",
    });
  }

  if (!isUIMessageArray(body.messages) || body.messages.length === 0) {
    return createErrorResponse({
      status: 400,
      message: "messages must be a non-empty array",
      type: "invalid_request",
    });
  }

  const messages = body.messages;
  const model = typeof body.model === "string" && body.model ? body.model : conversation.model;
  const provider = typeof body.provider === "string" ? body.provider : conversation.provider;

  // Persist the model/provider the user actually chose, so reloading the
  // conversation restores it rather than resetting to a default.
  if (model !== conversation.model || provider !== conversation.provider) {
    updateConversation(conversationId, { model, provider });
  }

  // ── Persistence lifecycle ──────────────────────────────────────────────────
  // The user turn is written BEFORE the stream starts. If the provider dies
  // mid-stream, onFinish never fires — and if this were deferred, the user's
  // prompt would be destroyed while they were still billed for it.
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === "user") {
    appendMessage({
      conversationId,
      role: "user",
      parts: (lastMessage.parts ?? []) as unknown[],
      status: "complete",
    });
  }

  // The assistant row goes in as 'streaming'. Anything that never reaches
  // onFinish/onError is swept to 'interrupted' at startup — otherwise a crashed
  // turn is indistinguishable from a completed one.
  const assistantMessage = appendMessage({
    conversationId,
    role: "assistant",
    parts: [],
    status: "streaming",
    model,
  });

  const turn = createRouterTurn(model);

  // streamText's onFinish carries usage; the UI-stream's onFinish carries the
  // rendered parts. Neither has both, so the token counts are stashed here and
  // written once, in the later of the two.
  let usage: { inputTokens: number | null; outputTokens: number | null } = {
    inputTokens: null,
    outputTokens: null,
  };

  const result = streamText({
    model: turn.model,
    system: conversation.systemPrompt ?? undefined,
    messages: await convertToModelMessages(messages),
    // Aborts the browser->route hop. NOTE: the router does not currently thread
    // this through to the provider (src/sse/handlers/chat.ts has no signal
    // plumbing), so stopping halts rendering, NOT upstream billing. The UI must
    // not claim otherwise.
    abortSignal: request.signal,
    onFinish: (event) => {
      usage = {
        inputTokens: event.totalUsage?.inputTokens ?? null,
        outputTokens: event.totalUsage?.outputTokens ?? null,
      };
    },
    onError: ({ error }) => {
      updateMessage(assistantMessage.id, {
        status: "error",
        parts: [
          {
            type: "text",
            text: error instanceof Error ? error.message : "Request failed",
          },
        ],
        requestId: turn.getRequestId(),
      });
    },
    onAbort: () => {
      updateMessage(assistantMessage.id, {
        status: "interrupted",
        requestId: turn.getRequestId(),
      });
    },
  });

  return result.toUIMessageStreamResponse({
    onFinish: ({ responseMessage }) => {
      updateMessage(assistantMessage.id, {
        parts: (responseMessage?.parts ?? []) as unknown[],
        status: "complete",
        requestId: turn.getRequestId(),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });
    },
  });
}
