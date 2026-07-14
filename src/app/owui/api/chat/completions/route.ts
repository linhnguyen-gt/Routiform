import { createErrorResponse } from "@/lib/api/errorResponse";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { callRouter } from "@/lib/chat/router-client";
import {
  createChat,
  getChat,
  saveChatContent,
  updateChatMeta,
  type OwuiChatContent,
  type OwuiMessage,
} from "@/lib/db/owui-chats";
import {
  attachMessage,
  deriveTitle,
  emptyChatContent,
  hasAnswer,
  toRouterMessages,
} from "@/lib/owui/chat-tree";
import { registerTask, releaseTask } from "@/lib/owui/chat-tasks";
import { withMemoryContext } from "@/lib/owui/memory-context";
import { emitChatEvent } from "@/lib/owui/socket-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Open WebUI's chat turn.
 *
 * Two things about this are not what you would guess from the endpoint's name.
 *
 * 1. **The client does not send `messages`.** It sends the ONE new `user_message` plus its
 *    `parent_id` (Chat.svelte:2589), and the backend rebuilds the conversation by walking the
 *    stored message tree. So this route cannot be stateless: persistence is a prerequisite of
 *    completions, not a feature layered on top of it.
 *
 * 2. **The answer does not come back over this HTTP response.** It returns
 *    `{ task_ids, chat_id }` immediately and every token arrives over socket.io
 *    (Chat.svelte:926 → chatCompletionEventHandler). The turn therefore OUTLIVES the request
 *    that started it, and `request.signal` must not cancel it — the browser hangs up the
 *    moment this returns. Cancellation is the Stop button, via owui/api/tasks/stop.
 */

interface CompletionsBody {
  model?: unknown;
  chat_id?: unknown;
  parent_id?: unknown;
  user_message?: unknown;
  /** The client's own socket id. Without it there is nowhere to send the answer. */
  session_id?: unknown;
  /** Id of the assistant message the client has already rendered as pending. */
  id?: unknown;
  folder_id?: unknown;
  /** Per-turn toggles. Only `memory` is honoured; the rest are features Routiform does not ship. */
  features?: unknown;
}

/** `features.memory`, or undefined when the client did not say. */
function memoryFeature(features: unknown): boolean | undefined {
  if (typeof features !== "object" || features === null) return undefined;
  const value = (features as Record<string, unknown>).memory;
  return typeof value === "boolean" ? value : undefined;
}

function isMessage(value: unknown): value is OwuiMessage {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return typeof m.id === "string" && typeof m.role === "string";
}

export async function POST(request: Request): Promise<Response> {
  // Cookie-session only, matching /api/chat: a router API key handed to a coding agent must
  // not also be able to drive — or read — the user's chat.
  const unauthorized = await requireManagementAuth(request);
  if (unauthorized) return unauthorized;

  let body: CompletionsBody;
  try {
    body = (await request.json()) as CompletionsBody;
  } catch {
    return createErrorResponse({
      status: 400,
      message: "Invalid JSON body",
      type: "invalid_request",
    });
  }

  const model = typeof body.model === "string" ? body.model : "";
  const sessionId = typeof body.session_id === "string" ? body.session_id : "";
  const assistantId = typeof body.id === "string" ? body.id : "";
  const userMessage = isMessage(body.user_message) ? body.user_message : null;
  const parentId = typeof body.parent_id === "string" ? body.parent_id : null;
  const folderId = typeof body.folder_id === "string" ? body.folder_id : null;
  const requestedChatId = typeof body.chat_id === "string" ? body.chat_id : "";

  if (!model || !userMessage) {
    return createErrorResponse({
      status: 400,
      message: "model and user_message are required",
      type: "invalid_request",
    });
  }

  if (!sessionId || !assistantId) {
    return createErrorResponse({
      status: 400,
      message: "No realtime connection. Reload the page and try again.",
      type: "invalid_request",
    });
  }

  // ── Resolve (or create) the chat, and graft this turn onto its tree ────────────────────
  let chatId = requestedChatId;
  let content: OwuiChatContent;

  if (chatId) {
    const existing = getChat(chatId);
    if (!existing) {
      return createErrorResponse({
        status: 404,
        message: "Chat not found",
        type: "invalid_request",
      });
    }
    content = existing.chat;
  } else {
    content = emptyChatContent([model]);
  }

  // Decided BEFORE this turn is grafted on, or the answer we are about to write would itself
  // count as "already answered".
  const needsTitle = parentId === null && !hasAnswer(content.history);

  if (!content.models?.includes(model)) content.models = [model];

  attachMessage(content.history, {
    ...userMessage,
    parentId,
    childrenIds: [],
    role: "user",
    content: typeof userMessage.content === "string" ? userMessage.content : "",
  });

  // The assistant node is stored BEFORE the stream starts, with done:false. If the provider
  // dies mid-turn, reloading the chat then shows an unfinished answer rather than a user
  // question whose reply vanished without trace.
  const assistantMessage: OwuiMessage = {
    id: assistantId,
    parentId: userMessage.id,
    childrenIds: [],
    role: "assistant",
    content: "",
    model,
    done: false,
    timestamp: Math.floor(Date.now() / 1000),
  };
  attachMessage(content.history, assistantMessage);
  content.history.currentId = assistantId;

  // Built BEFORE persisting, from the path ending at the USER turn: the assistant placeholder
  // is empty and must not be sent upstream. Memories ride in front of it as a system turn — the
  // client sends only the FLAG (features.memory), never the memories themselves, so if this route
  // does not fetch and inject them, Personalization is a write-only diary.
  const messages = withMemoryContext(
    toRouterMessages(content.history, userMessage.id),
    memoryFeature(body.features)
  );

  if (chatId) {
    saveChatContent(chatId, content);
  } else {
    chatId = createChat(content, deriveTitle(userMessage.content), folderId).id;
  }

  // Name the conversation.
  //
  // The SPA creates the chat ITSELF, before this route ever runs (Chat.svelte:2923 →
  // POST /chats/new), and hardcodes the title to `$i18n.t('New Chat')`. It never names it again:
  // upstream titles the chat server-side and pushes the result down as a `chat:title` socket event
  // (Chat.svelte:699). So if this route does not do it, nothing does — every conversation in the
  // sidebar stays "New Chat" forever.
  //
  // That is precisely what regressed here: POST /chats/new used to 404, which left `chat_id` empty
  // and made the createChat() branch above — with its deriveTitle — the only path a chat could be
  // born through. Implementing /chats/new quietly took the naming away with it.
  //
  // The guard is `parentId === null && no answer yet`, NOT a check for the string "New Chat": that
  // title is localised, so string-matching it would silently stop working the moment the operator
  // switches language. This way it also cannot clobber a title the user set by hand — by then the
  // chat has an answer in it.
  if (needsTitle) {
    const title = deriveTitle(userMessage.content);
    updateChatMeta(chatId, { title });
    emitChatEvent(sessionId, chatId, assistantId, "chat:title", title);
  }

  const taskId = crypto.randomUUID();
  const controller = new AbortController();
  registerTask(taskId, chatId, controller);

  // Intentionally not awaited: see the docstring. It reports its own failures over the socket.
  void runTurn({ taskId, controller, model, messages, sessionId, chatId, assistantId });

  return Response.json({ task_ids: [taskId], chat_id: chatId });
}

interface TurnArgs {
  taskId: string;
  controller: AbortController;
  model: string;
  messages: { role: string; content: unknown }[];
  sessionId: string;
  chatId: string;
  assistantId: string;
}

async function runTurn(args: TurnArgs): Promise<void> {
  const { taskId, controller, model, messages, sessionId, chatId, assistantId } = args;

  const emit = (type: string, data: unknown) =>
    emitChatEvent(sessionId, chatId, assistantId, type, data);

  let answer = "";

  try {
    const response = await callRouter(
      { model, messages, stream: true, stream_options: { include_usage: true } },
      controller.signal
    );

    if (!response.ok || !response.body) {
      const message = await readError(response);
      persist(chatId, assistantId, answer, { error: message });
      emit("chat:completion", { id: assistantId, error: { message }, done: true });
      return;
    }

    for await (const chunk of parseSseChunks(response.body)) {
      // Forwarded, not reshaped: the client reads `choices[0].delta.content` and `usage`
      // straight off an OpenAI chunk, which is exactly what the router emits.
      answer += deltaOf(chunk);
      emit("chat:completion", {
        id: assistantId,
        choices: chunk.choices,
        usage: chunk.usage,
        done: false,
      });
    }

    // A provider can end a stream cleanly having said NOTHING — an expired upstream account
    // does exactly this, HTTP 200 with an empty body. Left alone, the user gets a blank
    // assistant bubble and no reason for it, which reads as "the chat is broken" rather than
    // "this model is not working". Observed with a stale `codex` login; it cost an hour of
    // debugging the wrong layer, so it is called out rather than swallowed.
    if (answer === "") {
      const message = `${model} returned an empty response. The provider accepted the request but sent no content — its account may be expired or rate limited. Try another model.`;
      persist(chatId, assistantId, answer, { error: message });
      emit("chat:completion", { id: assistantId, error: { message }, done: true });
      return;
    }

    persist(chatId, assistantId, answer);
    emit("chat:completion", { id: assistantId, done: true });
  } catch (error) {
    // An abort is the Stop button, not a failure: the client has already marked the message
    // done (Chat.svelte:2737), so reporting an error would be a lie. Whatever streamed before
    // the stop is still the answer, and is kept.
    if (controller.signal.aborted) {
      persist(chatId, assistantId, answer);
    } else {
      const message = error instanceof Error ? error.message : "Request failed";
      persist(chatId, assistantId, answer, { error: message });
      emit("chat:completion", { id: assistantId, error: { message }, done: true });
    }
  } finally {
    releaseTask(taskId);
    // Clears `taskIds` on the client. Without it the composer shows Stop forever, because
    // `isActive` is gated on taskIds being non-empty (MessageInput.svelte:129) and nothing
    // else ever clears it.
    emit("chat:active", { active: false });
  }
}

/**
 * Write the finished answer back into the stored tree.
 *
 * Re-read rather than closed over: the blob may have been rewritten while the turn was in
 * flight (a second tab, or the client saving chat params), and writing a stale copy would
 * silently roll that back.
 */
function persist(
  chatId: string,
  assistantId: string,
  answer: string,
  extra?: Record<string, unknown>
): void {
  const chat = getChat(chatId);
  if (!chat) return;

  const message = chat.chat.history.messages[assistantId];
  if (!message) return;

  message.content = answer;
  message.done = true;
  Object.assign(message, extra ?? {});

  saveChatContent(chatId, chat.chat);
}

interface SseChunk {
  choices?: { delta?: { content?: unknown } }[];
  usage?: unknown;
}

function deltaOf(chunk: SseChunk): string {
  const content = chunk.choices?.[0]?.delta?.content;
  return typeof content === "string" ? content : "";
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // Not JSON — fall through to the raw body.
  }
  return text || `Router returned ${response.status}`;
}

/** Reassembles OpenAI SSE frames from a byte stream that may split them anywhere. */
async function* parseSseChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<SseChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Anything after the last newline is a PARTIAL frame and must stay in the buffer.
      // Parsing everything on each read would corrupt any chunk that straddles a packet.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;

        try {
          yield JSON.parse(payload) as SseChunk;
        } catch {
          // A non-JSON frame is not worth killing the turn over.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
