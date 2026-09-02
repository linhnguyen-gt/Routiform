import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import dns from "dns";
import zlib from "zlib";
import os from "os";
import { execSync } from "child_process";
import { promisify } from "util";
import tls from "tls";

import { loadRootCA, generateLeafCert } from "./cert/rootCA.js";

function getDataDir() {
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR.trim());
  return path.join(os.homedir(), ".routiform");
}

const DATA_DIR = getDataDir();
const LOCAL_PORT = 443;
const ROUTER_BASE =
  String(process.env.MITM_ROUTER_BASE || "http://localhost:20128")
    .trim()
    .replace(/\/+$/, "") || "http://localhost:20128";
const API_KEY = process.env.ROUTER_API_KEY;
const SQLITE_FILE = path.join(DATA_DIR, "storage.sqlite");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sqliteDb: any = null;

const ENABLE_FILE_LOG = !!process.env.MITM_DUMP_ENABLED;

if (!API_KEY) {
  console.error("ROUTER_API_KEY required");
  process.exit(1);
}

// ── Multi-tool constants (mirrored from src/mitm/config.ts) ──────
const TARGET_HOSTS = [
  "daily-cloudcode-pa.googleapis.com",
  "cloudcode-pa.googleapis.com",
  "api.individual.githubcopilot.com",
  "q.us-east-1.amazonaws.com",
  "api2.cursor.sh",
];

const URL_PATTERNS: Record<string, string[]> = {
  antigravity: [":generateContent", ":streamGenerateContent"],
  copilot: ["/chat/completions", "/v1/messages", "/responses"],
  kiro: ["/generateAssistantResponse"],
  cursor: ["/BidiAppend", "/RunSSE", "/RunPoll", "/Run"],
};

const MODEL_SYNONYMS: Record<string, Record<string, string>> = {
  antigravity: {
    "gemini-default": "gemini-3-flash",
    "gemini-3.8-flash": "gemini-3.8-flash-high",
  },
};

const LOG_BLACKLIST_URL_PARTS = [
  "recordCodeAssistMetrics",
  "recordTrajectoryAnalytics",
  "fetchAdminControls",
  "listExperiments",
  "fetchUserInfo",
];

function getToolForHost(host?: string): string | null {
  const h = (host || "").split(":")[0];
  if (h === "api.individual.githubcopilot.com") return "copilot";
  if (h === "daily-cloudcode-pa.googleapis.com" || h === "cloudcode-pa.googleapis.com")
    return "antigravity";
  if (h === "q.us-east-1.amazonaws.com") return "kiro";
  if (h === "api2.cursor.sh") return "cursor";
  return null;
}

// ── SSL Certificates ──────────────────────────────────────────────
let rootCA: ReturnType<typeof loadRootCA>;
let rootKeyPem: string;
let rootCertPem: string;
try {
  rootCA = loadRootCA();
  rootKeyPem = fs.readFileSync(path.join(DATA_DIR, "mitm", "rootCA.key"), "utf-8");
  rootCertPem = fs.readFileSync(path.join(DATA_DIR, "mitm", "rootCA.crt"), "utf-8");
  console.log("Root CA loaded");
} catch (e) {
  console.error("Root CA not found:", (e as Error).message);
  process.exit(1);
}

const certCache = new Map<string, tls.SecureContext>();

function sniCallback(servername: string, cb: (err: Error | null, ctx?: tls.SecureContext) => void) {
  try {
    if (certCache.has(servername)) return cb(null, certCache.get(servername));

    const leaf = generateLeafCert(servername, rootCA);
    const ctx = tls.createSecureContext({
      key: leaf.key,
      cert: leaf.cert + "\n" + rootCertPem,
    });
    certCache.set(servername, ctx);
    console.log("Cert generated: " + servername);
    cb(null, ctx);
  } catch (e) {
    console.error("Cert failed: " + (e as Error).message);
    cb(e as Error);
  }
}

const sslOptions: https.ServerOptions = {
  key: rootKeyPem,
  cert: rootCertPem,
  SNICallback: sniCallback,
};

// ── Logger / Dumper ──────────────────────────────────────────────
const DUMP_DIR = path.join(DATA_DIR, "logs", "mitm");
if (ENABLE_FILE_LOG && !fs.existsSync(DUMP_DIR)) {
  fs.mkdirSync(DUMP_DIR, { recursive: true });
}

const EMPTY_BODY_RE = /^\s*(\{\s*\}|\[\s*\]|null)?\s*$/;

function slugify(s: string, max = 80): string {
  return String(s)
    .replace(/[^a-zA-Z0-9]/g, "_")
    .substring(0, max);
}

function isBlacklisted(url: string): boolean {
  if (!url) return false;
  return LOG_BLACKLIST_URL_PARTS.some((part) => url.includes(part));
}

function decodeBody(buf: Buffer, encoding?: string): Buffer {
  if (!buf || buf.length === 0) return buf;
  try {
    const enc = (encoding || "").toLowerCase();
    if (enc.includes("gzip")) return zlib.gunzipSync(buf);
    if (enc.includes("br")) return zlib.brotliDecompressSync(buf);
    if (enc.includes("deflate")) return zlib.inflateSync(buf);
  } catch {
    /* return raw */
  }
  return buf;
}

function dumpRequest(req: http.IncomingMessage, bodyBuffer: Buffer, tag = "raw"): string | null {
  if (!ENABLE_FILE_LOG) return null;
  if (isBlacklisted(req.url || "")) return null;
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const slug = slugify((req.headers.host || "") + (req.url || ""));
    const file = path.join(DUMP_DIR, `${ts}_${tag}_${slug}.req.json`);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(bodyBuffer.toString());
    } catch {
      /* not JSON */
    }
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          method: req.method,
          url: req.url,
          host: req.headers.host,
          headers: req.headers,
          body: parsed !== null ? parsed : bodyBuffer.toString("utf8"),
        },
        null,
        2
      )
    );
    return file;
  } catch {
    return null;
  }
}

interface Dumper {
  writeHeader(status: number, headers: Record<string, string | string[] | undefined>): void;
  writeChunk(chunk: Buffer | string): void;
  end(): void;
  file: string;
}

function createResponseDumper(req: http.IncomingMessage, tag = "raw"): Dumper | null {
  if (!ENABLE_FILE_LOG) return null;
  if (isBlacklisted(req.url || "")) return null;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = slugify((req.headers.host || "") + (req.url || ""));
  const file = path.join(DUMP_DIR, `${ts}_${tag}_${slug}.res.txt`);
  let status = 0;
  let headers: Record<string, string | string[] | undefined> = {};
  const chunks: Buffer[] = [];
  return {
    writeHeader: (s, h) => {
      status = s;
      headers = h || {};
    },
    writeChunk: (chunk) => {
      if (chunk == null) return;
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    },
    end: () => {
      try {
        const raw = Buffer.concat(chunks);
        const enc = (headers["content-encoding"] || headers["Content-Encoding"]) as
          string | undefined;
        const decoded = decodeBody(raw, enc);
        const text = decoded.toString("utf8");
        if (EMPTY_BODY_RE.test(text)) return;
        const cleanHeaders: Record<string, unknown> = { ...headers };
        delete cleanHeaders["content-encoding"];
        delete cleanHeaders["Content-Encoding"];
        const out =
          "STATUS: " +
          status +
          "\nHEADERS: " +
          JSON.stringify(cleanHeaders, null, 2) +
          "\n---BODY---\n" +
          text;
        fs.writeFileSync(file, out);
      } catch {
        /* ignore */
      }
    },
    file,
  };
}

// ── Resolve real IP ──────────────────────────────────────────────
interface CachedIP {
  ip: string;
  ts: number;
}
const cachedTargetIPs: Record<string, CachedIP> = {};
const CACHE_TTL_MS = 5 * 60 * 1000;

async function resolveTargetIP(hostname: string): Promise<string> {
  const cached = cachedTargetIPs[hostname];
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.ip;
  const resolver = new dns.Resolver();
  resolver.setServers(["8.8.8.8"]);
  const resolve4 = promisify(resolver.resolve4.bind(resolver)) as (
    hostname: string
  ) => Promise<string[]>;
  const addresses = await resolve4(hostname);
  cachedTargetIPs[hostname] = { ip: addresses[0], ts: Date.now() };
  return cachedTargetIPs[hostname].ip;
}

// ── Body & model helpers ─────────────────────────────────────────
function collectBodyRaw(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function extractModel(url: string, body: Buffer): string | null {
  const urlMatch = url.match(/\/models\/([^/:]+)/);
  if (urlMatch) return urlMatch[1];
  try {
    const parsed = JSON.parse(body.toString());
    if (parsed.model) return parsed.model;
    if (parsed.conversationState?.currentMessage?.userInputMessage?.modelId)
      return parsed.conversationState.currentMessage.userInputMessage.modelId;
  } catch {
    return null;
  }
  return null;
}

let _sqliteDbPending: Promise<unknown> | null = null;

async function getSqliteDb() {
  if (_sqliteDb) return _sqliteDb;
  if (_sqliteDbPending) return _sqliteDbPending;
  _sqliteDbPending = (async () => {
    try {
      const mod = await import("better-sqlite3");
      const Database = mod.default;
      if (fs.existsSync(SQLITE_FILE)) {
        _sqliteDb = new Database(SQLITE_FILE);
        return _sqliteDb;
      }
    } catch {
      /* not available */
    }
    return null;
  })();
  return _sqliteDbPending;
}

async function getMappedModel(tool: string, model: string): Promise<string | null> {
  if (!model) return null;
  const synonyms = MODEL_SYNONYMS[tool] || {};
  const normalized = synonyms[model] || model;

  console.log(
    "getMappedModel: tool=" +
      tool +
      " model=" +
      JSON.stringify(model) +
      " normalized=" +
      JSON.stringify(normalized)
  );

  try {
    const db = await getSqliteDb();
    if (db) {
      const row = db
        .prepare("SELECT value FROM key_value WHERE namespace = 'mitmAlias' AND key = ?")
        .get(tool) as { value: string } | undefined;
      if (row) {
        const mappings = JSON.parse(row.value);
        const result = mappings[normalized] || null;
        console.log("getMappedModel: " + normalized + " → " + (result || "null"));
        return result;
      }
    }
  } catch (e) {
    console.log("getMappedModel: SQLite error: " + (e as Error).message);
  }

  return null;
}

// ── Handler loader ───────────────────────────────────────────────
interface Handler {
  intercept: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    bodyBuffer: Buffer,
    mappedModel: string
  ) => Promise<void>;
}

const loadedHandlers: Record<string, Handler> = {};

async function getHandler(name: string): Promise<Handler | null> {
  if (loadedHandlers[name]) return loadedHandlers[name];
  try {
    const mod = await import(`./handlers/${name}.js`);
    loadedHandlers[name] = mod as Handler;
    return mod as Handler;
  } catch (e) {
    console.error("Failed to load handler " + name + ": " + (e as Error).message);
    return null;
  }
}

// ── Passthrough ──────────────────────────────────────────────────
function rewriteHost(host: string): string {
  if (host === "cloudcode-pa.googleapis.com") return "daily-cloudcode-pa.googleapis.com";
  return host;
}

async function passthrough(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  bodyBuffer: Buffer,
  onResponse?: (body: Buffer, headers: http.IncomingHttpHeaders) => void
) {
  const targetHost = rewriteHost((req.headers.host || TARGET_HOSTS[0]).split(":")[0]);
  const targetIP = await resolveTargetIP(targetHost);
  const rejectUnauthorized = process.env.MITM_DISABLE_TLS_VERIFY !== "1";
  const dumper = createResponseDumper(req, "passthrough");

  const fwdHeaders: Record<string, string | string[] | undefined> = {
    ...req.headers,
    host: targetHost,
  };
  delete fwdHeaders["x-routiform-source"];

  const forwardReq = https.request(
    {
      hostname: targetIP,
      port: 443,
      path: req.url,
      method: req.method,
      headers: fwdHeaders,
      servername: targetHost,
      rejectUnauthorized,
    },
    (forwardRes) => {
      res.writeHead(forwardRes.statusCode || 200, forwardRes.headers);
      if (dumper) dumper.writeHeader(forwardRes.statusCode || 200, forwardRes.headers);

      if (!onResponse && !dumper) {
        forwardRes.pipe(res);
        return;
      }

      const chunks: Buffer[] = [];
      forwardRes.on("data", (chunk: Buffer) => {
        if (dumper) dumper.writeChunk(chunk);
        if (onResponse) chunks.push(chunk);
        res.write(chunk);
      });
      forwardRes.on("end", () => {
        if (dumper) dumper.end();
        res.end();
        if (onResponse) {
          try {
            onResponse(Buffer.concat(chunks), forwardRes.headers);
          } catch {
            /* ignore */
          }
        }
      });
    }
  );

  forwardReq.on("error", (e) => {
    console.error("Passthrough error: " + e.message);
    if (dumper) {
      dumper.writeChunk("\n[ERROR] " + e.message + "\n");
      dumper.end();
    }
    if (!res.headersSent) res.writeHead(502);
    res.end("Bad Gateway");
  });

  if (bodyBuffer.length > 0) forwardReq.write(bodyBuffer);
  forwardReq.end();
}

// ── DNS cleanup on shutdown ──────────────────────────────────────
const HOSTS_PATH =
  process.platform === "win32"
    ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "drivers", "etc", "hosts")
    : "/etc/hosts";

function removeAllDNSEntriesSync() {
  try {
    if (!fs.existsSync(HOSTS_PATH)) return;
    const content = fs.readFileSync(HOSTS_PATH, "utf-8");
    const lines = content.split("\n");
    const cleaned = lines.filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) return true;
      if (!trimmed) return true;
      if (!trimmed.startsWith("127.0.0.1")) return true;
      for (const host of TARGET_HOSTS) {
        if (trimmed.includes(host)) return false;
      }
      return true;
    });
    if (cleaned.length !== lines.length) {
      fs.writeFileSync(HOSTS_PATH, cleaned.join("\n"));
      console.log("Cleaned MITM DNS entries from hosts file");
    }
  } catch (e) {
    console.error("Failed to clean DNS entries: " + (e as Error).message);
  }
}

// ── Self-loop / scanner rejection ────────────────────────────────
const IP_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
function isHostSelfLoop(host: string): boolean {
  const h = (host || "").replace(/:.*$/, "").trim();
  if (!h) return true;
  if (IP_RE.test(h) || h === "localhost" || h === "127.0.0.1" || h === "::1") return true;
  return false;
}

// ── Main server ──────────────────────────────────────────────────
const server = https.createServer(sslOptions, async (req, res) => {
  const host = (req.headers.host || "").replace(/:.*$/, "");

  console.log("REQUEST: " + req.method + " " + req.url + " | host=" + (host || "?"));

  // Health probe must come before scanner rejection (manager polls 127.0.0.1)
  if (req.method === "GET" && req.url === "/_mitm_health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, pid: process.pid }));
    return;
  }

  if (isHostSelfLoop(host)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
    return;
  }

  const bodyBuffer = await collectBodyRaw(req);
  console.log("BODY: " + bodyBuffer.length + " bytes | " + req.url);

  if (ENABLE_FILE_LOG) dumpRequest(req, bodyBuffer);

  if (req.headers["x-routiform-source"] === "routiform") {
    return passthrough(req, res, bodyBuffer);
  }

  const tool = getToolForHost(req.headers.host);
  if (!tool) {
    console.log("passthrough | no tool for host=" + req.headers.host);
    return passthrough(req, res, bodyBuffer);
  }

  const patterns = URL_PATTERNS[tool] || [];
  const isChatRequest = patterns.some((p) => (req.url || "").includes(p));
  if (!isChatRequest) {
    return passthrough(req, res, bodyBuffer);
  }

  const model = extractModel(req.url || "", bodyBuffer);

  if (tool === "cursor") {
    console.log("cursor | not implemented");
    res.writeHead(501, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: { message: "Cursor MITM support is coming soon.", type: "not_implemented" },
      })
    );
    return;
  }

  const mappedModel = await getMappedModel(tool, model || "");

  if (!mappedModel) {
    console.log("passthrough | no mapping | tool=" + tool + " model=" + JSON.stringify(model));
    return passthrough(req, res, bodyBuffer);
  }

  console.log("intercept | " + tool + " | " + model + " → " + mappedModel);

  const handler = await getHandler(tool);
  if (!handler) {
    return passthrough(req, res, bodyBuffer);
  }

  return handler.intercept(req, res, bodyBuffer, mappedModel);
});

function killPortThenListen() {
  try {
    const output = execSync("lsof -ti tcp:443 -sTCP:LISTEN", {
      encoding: "utf8",
      timeout: 3000,
    }).trim();
    if (output) {
      const pids = output.split("\n").filter(Boolean);
      for (const pidStr of pids) {
        try {
          const pid = parseInt(pidStr, 10);
          if (pid !== process.pid) {
            process.kill(pid, "SIGTERM");
            console.log("Killed existing process on port 443: PID " + pid);
          }
        } catch {
          /* not our process to kill */
        }
      }
    }
  } catch {
    /* lsof not available or no processes on port */
  }

  server.listen(LOCAL_PORT, () => {
    console.log("MITM ready on :" + LOCAL_PORT + " → " + ROUTER_BASE);
  });
}

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error("Port " + LOCAL_PORT + " already in use");
  } else if (error.code === "EACCES") {
    console.error("Permission denied for port " + LOCAL_PORT);
  } else {
    console.error(error.message);
  }
  process.exit(1);
});

function shutdown() {
  console.log("MITM shutting down...");
  removeAllDNSEntriesSync();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

killPortThenListen();
