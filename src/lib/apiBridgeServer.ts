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

function proxyRequest(req: IncomingMessage, res: ServerResponse, dashboardPort: number): void {
  const targetReq = http.request(
    {
      hostname: "127.0.0.1",
      port: dashboardPort,
      method: req.method,
      path: req.url,
      headers: {
        ...req.headers,
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
  var __omnirouteApiBridgeStarted: boolean | undefined;
}

export function initApiBridgeServer(): void {
  if (globalThis.__omnirouteApiBridgeStarted) return;

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
    globalThis.__omnirouteApiBridgeStarted = true;
    console.log(`[API Bridge] Listening on ${host}:${apiPort} -> dashboard:${dashboardPort}`);
  });
}
