import { streamText, convertToModelMessages, type UIMessage } from "ai";

import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { createErrorResponse } from "@/lib/api/errorResponse";
import { createRouterTurn } from "@/lib/chat/router-client";
import { rehydrateAttachments } from "@/lib/chat/rehydrate-attachments";
import {
  appendMessage,
  getConversation,
  truncateMessagesTo,
  updateConversation,
  updateMessage,
} from "@/lib/db/chat";

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
  // Note this persists the parts AS SENT — attachments stay hash references. The bytes are
  // pulled in only for the outbound provider request below, so a conversation row never
  // carries base64 and never grows past what the 10 MB body cap allows on the next turn.
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === "user") {
    // The client re-POSTs its whole array every turn, so it — not the table — is the truth
    // about the transcript's shape. A regenerate re-sends the array ending at the user turn
    // it is retrying; an edit re-sends a truncated array. Either way, rows persisted BEYOND
    // what the client still holds were dropped by the user and must not survive: otherwise a
    // regenerate silently duplicates the question and strands the old answer under it.
    truncateMessagesTo(conversationId, messages.length - 1);

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

  // Set by onError/onAbort. The UI-stream's onFinish below fires even when the turn FAILED —
  // a provider error arrives as an error chunk and the stream still closes normally, and an
  // abort reaches it through the transform's cancel(). Without this flag, that onFinish would
  // overwrite status 'error' with 'complete' and replace the error text with empty parts,
  // leaving a crashed turn indistinguishable from a successful one on reload. Which is the
  // exact thing the status column exists to prevent.
  let terminal: "error" | "interrupted" | null = null;

  const result = streamText({
    model: turn.model,
    system: conversation.systemPrompt ?? undefined,
    // Hash references become real bytes here, and only here.
    messages: await convertToModelMessages(rehydrateAttachments(messages)),
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
      terminal = "error";
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
      terminal = "interrupted";
      updateMessage(assistantMessage.id, {
        status: "interrupted",
        requestId: turn.getRequestId(),
      });
    },
  });

  return result.toUIMessageStreamResponse({
    onFinish: ({ responseMessage }) => {
      // A failed or stopped turn already has its final row. Record the tokens it burned —
      // an aborted turn is still billed — but do NOT restate its status or overwrite the
      // error text with the empty parts a broken stream produces.
      if (terminal !== null) {
        updateMessage(assistantMessage.id, {
          requestId: turn.getRequestId(),
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        });
        return;
      }

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
