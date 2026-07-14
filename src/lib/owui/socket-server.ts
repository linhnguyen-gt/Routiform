import { createServer, type Server as HttpServer } from "node:http";
import { Server as IOServer, type Socket } from "socket.io";

/**
 * The socket.io server Open WebUI streams through.
 *
 * This exists because Open WebUI does NOT stream tokens over HTTP. `POST
 * /api/chat/completions` answers immediately with `{ task_ids, chat_id }`, and every token
 * then arrives as a socket.io `events` message (Chat.svelte:926 → chatCompletionEventHandler).
 * There is a `createOpenAITextStream` path in the source, but it is only used for the
 * multi-model "merge responses" feature — not for a normal turn. So without a socket server
 * the chat renders perfectly and then never says anything.
 *
 * Why a SIDE PORT and not a Next.js route:
 * Next route handlers are request/response; they cannot hold the long-lived connection
 * socket.io needs, and Routiform runs on stock `next start` (no custom server). So a plain
 * Node HTTP server is started here, on a loopback-only port, and Next rewrites
 * `/owui/ws/socket.io/*` onto it.
 *
 * Why POLLING is enough:
 * The client asks for `transports: ['polling', 'websocket']` (routes/+layout.svelte:133),
 * with polling FIRST. Polling is ordinary HTTP request/response, which passes through a Next
 * rewrite cleanly. The websocket upgrade will not survive the rewrite, socket.io will fail
 * it and stay on polling, and the chat works. If you ever see tokens arrive in bursts rather
 * than smoothly, this is the reason — not the model.
 */

const DEFAULT_PORT = 20130;

/**
 * The singleton lives on `globalThis`, not in a module-level `let`.
 *
 * Next compiles the instrumentation hook and the route handlers into SEPARATE chunks, so
 * each can get its OWN instance of this module. A module-local `io` would then be non-null
 * in the instrumentation copy (which started the server) and null in the route's copy
 * (which needs to emit) — every token would be dropped on the floor, silently.
 */
const SOCKET_KEY = Symbol.for("routiform.owui.socket");

interface SocketGlobal {
  [SOCKET_KEY]?: { io: IOServer; http: HttpServer };
}

const store = globalThis as SocketGlobal;

export function getSocketPort(): number {
  const raw = process.env.ROUTIFORM_OWUI_SOCKET_PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

/** Idempotent — Next may evaluate this module more than once, and does so in dev. */
export function startSocketServer(): IOServer {
  const existing = store[SOCKET_KEY];
  if (existing) return existing.io;

  const http = createServer();
  const io = new IOServer(http, {
    path: "/ws/socket.io",
    // The browser reaches this through a same-origin Next rewrite, so there is no
    // cross-origin request to allow. Keeping CORS closed means that if someone ever points
    // a page straight at the loopback port, the browser refuses.
    cors: { origin: false },
    // Open WebUI sends whole assistant turns; the 1MB default truncates long answers.
    maxHttpBufferSize: 1e7,
  });

  io.on("connection", (socket: Socket) => {
    // Deliberately no auth check on the socket's own `auth.token` — it is the inert token
    // minted in owui/api/v1/auths, and trusting it would turn it into a bearer credential
    // anyone can mint. The real gate is that this port is loopback-only and the only way in
    // is Next's rewrite, which sits behind src/proxy.ts. Do NOT expose this port.
    socket.on("usage", () => {
      /* upstream broadcasts active-user counts; nothing to report */
    });
  });

  http.listen(getSocketPort(), "127.0.0.1");
  store[SOCKET_KEY] = { io, http };
  return io;
}

export function getIO(): IOServer | null {
  return store[SOCKET_KEY]?.io ?? null;
}

/**
 * One streamed chunk, in the envelope Chat.svelte's `chatEventHandler` expects:
 * `{ chat_id, message_id, data: { type, data } }` (Chat.svelte:610-637).
 *
 * `sessionId` is the client's own socket id — the SPA sends it as `session_id` on the
 * completion request. Emitting to it rather than broadcasting means two open tabs do not
 * scribble each other's answers into the wrong transcript.
 */
export function emitChatEvent(
  sessionId: string,
  chatId: string,
  messageId: string,
  type: string,
  data: unknown
): void {
  getIO()?.to(sessionId).emit("events", {
    chat_id: chatId,
    message_id: messageId,
    data: { type, data },
  });
}
