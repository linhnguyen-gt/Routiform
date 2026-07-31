import http from "http";
import type { IncomingMessage, ServerResponse } from "http";
import { getRuntimePorts } from "@/lib/runtime/ports";
import { getApiBridgeTimeoutConfig } from "@/shared/utils/runtimeTimeouts";

const API_BRIDGE_TIMEOUTS = getApiBridgeTimeoutConfig(process.env, (message) => {
  console.warn(`[API Bridge] ${message}`);
});

const OPENAI_COMPAT_PATHS = [
  /^\/v1(?:\/|$)/,
  /^\/chat\/completions(?:\?|$)/,
  /^\/responses(?:\?|$)/,
  /^\/models(?:\?|$)/,
  /^\/codex(?:\/|\?|$)/,
  /^\/api\/oauth(?:\/|$)/,
  /^\/callback(?:\?|$)/,
];

function isOpenAiCompatiblePath(pathname: string): boolean {
  return OPENAI_COMPAT_PATHS.some((pattern) => pattern.test(pathname));
}

/**
 * Replace any client-supplied forwarding headers with the real socket peer.
 *
 * The bridge re-issues the request to the dashboard port, so whatever it forwards becomes the
 * origin as far as every downstream consumer is concerned. Passing the client's own
 * `x-forwarded-for` through would let a caller name its own address to the IP filter, the rate
 * limiter and the audit log.
 */
function withTrustedForwardingHeaders(req: IncomingMessage): Record<string, unknown> {
  const headers: Record<string, unknown> = { ...req.headers };

  for (const header of ["x-forwarded-for", "cf-connecting-ip", "x-real-ip", "forwarded"]) {
    delete headers[header];
  }

  const peer = req.socket?.remoteAddress;
  if (peer) headers["x-forwarded-for"] = peer;

  return headers;
}

function proxyRequest(req: IncomingMessage, res: ServerResponse, dashboardPort: number): void {
  const targetReq = http.request(
    {
      hostname: "127.0.0.1",
      port: dashboardPort,
      method: req.method,
      path: req.url,
      headers: {
        ...withTrustedForwardingHeaders(req),
        host: `127.0.0.1:${dashboardPort}`,
      },
      timeout: API_BRIDGE_TIMEOUTS.proxyTimeoutMs,
    },
    (targetRes) => {
      res.writeHead(targetRes.statusCode || 502, targetRes.headers);
      targetRes.pipe(res);
    }
  );

  targetReq.on("timeout", () => {
    targetReq.destroy();
    if (res.headersSent) return;
    res.writeHead(504, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "api_bridge_timeout",
        detail: `Proxy request timed out after ${API_BRIDGE_TIMEOUTS.proxyTimeoutMs}ms`,
      })
    );
  });

  targetReq.on("error", (error) => {
    if (res.headersSent) return;
    res.writeHead(502, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "api_bridge_unavailable",
        detail: String(error.message || error),
      })
    );
  });

  req.on("aborted", () => {
    targetReq.destroy();
  });

  req.pipe(targetReq);
}

declare global {
  var __routiformApiBridgeStarted: boolean | undefined;
}

export function initApiBridgeServer(): void {
  if (globalThis.__routiformApiBridgeStarted) return;

  const { apiPort, dashboardPort } = getRuntimePorts();
  if (apiPort === dashboardPort) return;

  const host = process.env.API_HOST || "127.0.0.1";

  const server = http.createServer((req, res) => {
    const rawUrl = req.url || "/";
    const pathname = rawUrl.split("?")[0] || "/";

    if (!isOpenAiCompatiblePath(pathname)) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "not_found",
          message: "API port only serves OpenAI-compatible routes.",
        })
      );
      return;
    }

    proxyRequest(req, res, dashboardPort);
  });
  server.requestTimeout = API_BRIDGE_TIMEOUTS.serverRequestTimeoutMs;
  server.headersTimeout = API_BRIDGE_TIMEOUTS.serverHeadersTimeoutMs;
  server.keepAliveTimeout = API_BRIDGE_TIMEOUTS.serverKeepAliveTimeoutMs;
  server.setTimeout(API_BRIDGE_TIMEOUTS.serverSocketTimeoutMs);

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error?.code === "EADDRINUSE") {
      console.warn(
        `[API Bridge] Port ${apiPort} is already in use. API bridge disabled. (dashboard: ${dashboardPort})`
      );
      return;
    }
    console.warn("[API Bridge] Failed to start:", error?.message || error);
  });

  server.listen(apiPort, host, () => {
    globalThis.__routiformApiBridgeStarted = true;
    console.log(`[API Bridge] Listening on ${host}:${apiPort} -> dashboard:${dashboardPort}`);
  });
}
