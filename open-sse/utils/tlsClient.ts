import { createRequire } from "module";
import { getTlsClientTimeoutConfig } from "@/shared/utils/runtimeTimeouts";

const require = createRequire(import.meta.url);

type WreqSession = {
  fetch: (url: string, options?: Record<string, unknown>) => Promise<Response>;
  close: () => Promise<void> | void;
};

type CreateSessionFn = (options: Record<string, unknown>) => Promise<WreqSession>;

let createSession: CreateSessionFn | null;
try {
  const loaded = require("wreq-js") as { createSession?: CreateSessionFn };
  createSession = typeof loaded.createSession === "function" ? loaded.createSession : null;
} catch {
  createSession = null;
}

/**
 * Get proxy URL from environment variables.
 * Priority: HTTPS_PROXY > HTTP_PROXY > ALL_PROXY
 */
function getProxyFromEnv(): string | undefined {
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    undefined
  );
}

interface FetchOptions {
  method?: string;
  headers?: HeadersInit;
  body?: unknown;
  redirect?: string;
  signal?: AbortSignal;
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;

  if (headers instanceof Headers) {
    const normalized: Record<string, string> = {};
    headers.forEach((value, key) => {
      normalized[key] = value;
    });
    return normalized;
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([key, value]) => [key, String(value)]));
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      normalized[key] = value;
    }
  }
  return normalized;
}

/**
 * TLS Client — Chrome 124 TLS fingerprint spoofing via wreq-js
 * Singleton instance used to disguise Node.js TLS handshake as Chrome browser.
 *
 * wreq-js natively supports proxy — TLS fingerprinting works through proxy.
 * Proxy URL is read from environment variables (HTTPS_PROXY, HTTP_PROXY, ALL_PROXY).
 */
class TlsClient {
  session: WreqSession | null = null;
  available: boolean;

  constructor() {
    this.available = !!createSession;
  }

  async getSession() {
    if (!this.available) return null;
    if (this.session) return this.session;

    const proxy = getProxyFromEnv();
    const sessionOpts: Record<string, unknown> = {
      browser: "chrome_124",
      os: "macos",
    };
    if (proxy) {
      sessionOpts.proxy = proxy;
      console.log(`[TlsClient] Using proxy: ${proxy}`);
    }

    this.session = await createSession(sessionOpts);
    console.log("[TlsClient] Session created (Chrome 124 TLS fingerprint)");
    return this.session;
  }

  /**
   * Fetch with Chrome 124 TLS fingerprint.
   * wreq-js Response is already fetch-compatible (headers, text(), json(), clone(), body).
   */
  async fetch(url: string, options: FetchOptions = {}) {
    const session = await this.getSession();
    if (!session) throw new Error("wreq-js not available");
    const { timeoutMs } = getTlsClientTimeoutConfig(process.env, (message) => {
      console.warn(`[TlsClient] ${message}`);
    });

    const method = (options.method || "GET").toUpperCase();

    const wreqOptions: Record<string, unknown> = {
      method,
      headers: normalizeHeaders(options.headers),
      body: options.body,
      redirect: options.redirect === "manual" ? "manual" : "follow",
      timeout: timeoutMs,
    };

    // Pass signal through if available
    if (options.signal) {
      wreqOptions.signal = options.signal;
    }

    const response = await session.fetch(url, wreqOptions);
    return response;
  }

  async exit() {
    if (this.session) {
      await this.session.close();
      this.session = null;
    }
  }
}

const tlsClient = new TlsClient();

export default tlsClient;
