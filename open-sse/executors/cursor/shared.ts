declare const EdgeRuntime: string | undefined;

// Detect cloud environment
const isCloudEnv = () => {
  if (typeof caches !== "undefined" && typeof caches === "object") return true;
  if (typeof EdgeRuntime !== "undefined") return true;
  return false;
};

// Lazy import http2 (only in Node.js environment)
export let http2 = null;
if (!isCloudEnv()) {
  try {
    http2 = await import("http2");
  } catch {
    // http2 not available
  }
}

// --- SECTION 1: Authentication Constants ---
export const COMPRESS_FLAG = {
  NONE: 0x00,
  GZIP: 0x01,
  GZIP_ALT: 0x02,
  GZIP_BOTH: 0x03,
};

const CURSOR_STREAM_DEBUG = process.env.CURSOR_STREAM_DEBUG === "1";
export const debugLog = (...args: unknown[]) => {
  if (CURSOR_STREAM_DEBUG) console.log(...args);
};
