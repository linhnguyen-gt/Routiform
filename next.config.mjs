import path from "node:path";
import { fileURLToPath } from "node:url";
import createNextIntlPlugin from "next-intl/plugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // When a parent directory has another lockfile (e.g. ~/pnpm-lock.yaml), Next.js may pick the
  // wrong workspace root and skip PostCSS — breaking Tailwind v4 (`@import "tailwindcss"`).
  outputFileTracingRoot: path.join(__dirname),
  // Default is 10MB; `src/proxy.ts` + `/api/db-backups/import` allow up to 100MB (see bodySizeGuard).
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
  // socket.io ALWAYS requests its path with a trailing slash ('/owui/ws/socket.io/?EIO=4...').
  // Next's default trailing-slash normalisation answers that with a 308 to the bare path.
  // A browser follows the redirect, so the embedded chat appeared to work — but every poll
  // then costs two round trips, a POST packet survives only because 308 preserves the body,
  // and any non-browser socket.io client (which does not follow redirects) cannot connect at
  // all. Serving the URL as requested is simpler than making the redirect safe.
  skipTrailingSlashRedirect: true,

  // MITM modules use runtime = "nodejs" + dynamic imports — no static bundling needed
  output: "standalone",
  serverExternalPackages: [
    "pino",
    "pino-pretty",
    "thread-stream",
    "better-sqlite3",
    "keytar",
    "wreq-js",
    "zod",
    "child_process",
    "fs",
    "path",
    "os",
    "crypto",
    "net",
    "tls",
    "http",
    "https",
    "stream",
    "buffer",
    "util",
  ],
  transpilePackages: ["@routiform/open-sse"],
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.*"],
  typescript: {
    // TODO: Re-enable after fixing all sub-component useTranslations scope issues
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer, webpack }) => {
    if (isServer) {
      // Webpack IgnorePlugin: skip thread-stream test files that contain
      // intentionally broken syntax/imports (they cause Turbopack build errors)
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /\/test\//,
          contextRegExp: /thread-stream/,
        })
      );
      // ── Turbopack / Next.js 16 module-hash patch (#394, #396, #398) ────────
      //
      // Next.js 16 (with or without Turbopack) compiles the instrumentation hook
      // into a separate chunk and emits hashed require() calls such as:
      //   require('better-sqlite3-90e2652d1716b047')
      //   require('zod-dcb22c6336e0bc69')
      //   require('pino-28069d5257187539')
      //
      // These hashed names don't exist in node_modules and cause a 500 at
      // startup on all npm global installs (issues #394, #396, #398).
      //
      // We use two strategies:
      //  1. Exact-name externals for all known server-side packages.
      //  2. Hash-strip catch-all: any require('<name>-<16hexchars>' strips the
      //     suffix and falls through to the real package name.
      //
      const HASH_PATTERN = /^(.+)-[0-9a-f]{16}$/;

      const KNOWN_EXTERNALS = new Set([
        "better-sqlite3",
        "keytar",
        "wreq-js",
        "zod",
        "pino",
        "pino-pretty",
        "child_process",
        "fs",
        "path",
        "os",
        "crypto",
        "net",
        "tls",
        "http",
        "https",
        "stream",
        "buffer",
        "util",
      ]);

      const prev = config.externals ?? [];
      const prevArr = Array.isArray(prev) ? prev : [prev];
      config.externals = [
        ...prevArr,
        ({ request }, callback) => {
          // Case 1: Exact known package — treat as external
          if (KNOWN_EXTERNALS.has(request)) {
            return callback(null, `commonjs ${request}`);
          }
          // Case 2: Hash-suffixed name — strip hash, use base name
          // e.g. "better-sqlite3-90e2652d1716b047" → "better-sqlite3"
          //      "zod-dcb22c6336e0bc69"            → "zod"
          const hashMatch = request?.match?.(HASH_PATTERN);
          if (hashMatch) {
            const baseName = hashMatch[1];
            return callback(null, `commonjs ${baseName}`);
          }
          callback();
        },
      ];
    } else {
      // Ignore native Node.js modules in browser bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        child_process: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }
    return config;
  },

  async rewrites() {
    return [
      {
        source: "/chat/completions",
        destination: "/api/v1/chat/completions",
      },
      {
        source: "/responses",
        destination: "/api/v1/responses",
      },
      {
        source: "/responses/:path*",
        destination: "/api/v1/responses/:path*",
      },
      {
        source: "/models",
        destination: "/api/v1/models",
      },
      {
        source: "/v1/v1/:path*",
        destination: "/api/v1/:path*",
      },
      {
        source: "/v1/v1",
        destination: "/api/v1",
      },
      {
        source: "/codex/:path*",
        destination: "/api/v1/responses",
      },
      {
        source: "/v1/:path*",
        destination: "/api/v1/:path*",
      },
      {
        source: "/v1",
        destination: "/api/v1",
      },

      // Open WebUI is a client-side SPA (adapter-static, fallback: index.html) served from
      // public/owui. Deep links like /owui/c/<chat-id> are ROUTES, not files, so they must
      // fall back to index.html and let the client router take over.
      //
      // This array is Next's `afterFiles` stage: real files under public/owui and the
      // /owui/api/* route handlers are matched FIRST, so this only catches what is left.
      //
      // `api` is EXCLUDED from the fallback on purpose. Without the negative lookahead this
      // rule swallows every not-yet-implemented backend route and answers it with the SPA's
      // index.html — HTTP 200, content-type text/html. The frontend then parses a web page
      // as JSON, and instead of an honest 404 you get a silent, baffling failure.
      // Bare `/owui` needs its own rule: the pattern below uses a REQUIRED param (it has to,
      // to carry the negative lookahead), so it does not match the prefix on its own.
      //
      // The socket.io transport must be matched BEFORE the SPA fallback below, or the
      // fallback answers the handshake with index.html and the chat never streams. It is
      // proxied to the loopback listener started in src/instrumentation-node.ts: socket.io
      // needs a long-lived connection, which a Next route handler cannot hold.
      // Long-polling (the client's first transport) is ordinary HTTP request/response, so it
      // survives this rewrite; the websocket upgrade does not, and socket.io stays on
      // polling. That is a throughput cost, not a correctness one.
      //
      // Both forms are needed. The client always requests '/owui/ws/socket.io/?EIO=4...'
      // WITH a trailing slash; Next's trailing-slash normalisation 308s that to the bare
      // '/owui/ws/socket.io', so the bare form is what actually reaches the rewrite. It must
      // still arrive at engine.io as '/ws/socket.io/' — engine.io matches its path with the
      // trailing slash appended, and a request without it is simply never handled: the
      // socket is left hanging and Next reports "Failed to proxy ... socket hang up" as a
      // 500. Which looks like a server crash and is really a missing slash.
      {
        source: "/owui/ws/socket.io",
        destination: `http://127.0.0.1:${process.env.ROUTIFORM_OWUI_SOCKET_PORT || 20130}/ws/socket.io/`,
      },
      {
        source: "/owui/ws/socket.io/:path*",
        destination: `http://127.0.0.1:${process.env.ROUTIFORM_OWUI_SOCKET_PORT || 20130}/ws/socket.io/:path*`,
      },
      {
        source: "/owui",
        destination: "/owui/index.html",
      },
      {
        source: "/owui/:path((?!api/|api$).*)",
        destination: "/owui/index.html",
      },
    ];
  },
};

export default withNextIntl(nextConfig);
