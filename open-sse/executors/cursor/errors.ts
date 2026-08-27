import zlib from "zlib";
import { COMPRESS_FLAG, debugLog } from "./shared.ts";

import { HTTP_STATUS } from "../../config/constants.ts";

export function decompressPayload(payload, flags) {
  // Check if payload is JSON error (starts with {"error")
  if (payload.length > 10 && payload[0] === 0x7b && payload[1] === 0x22) {
    try {
      const text = payload.toString("utf-8");
      if (text.startsWith('{"error"')) {
        debugLog(`[DECOMPRESS] Detected JSON error, skipping decompression`);
        return payload;
      }
    } catch {}
  }

  if (
    flags === COMPRESS_FLAG.GZIP ||
    flags === COMPRESS_FLAG.GZIP_ALT ||
    flags === COMPRESS_FLAG.GZIP_BOTH
  ) {
    // Primary: try gzip decompression (standard gzip header 0x1f 0x8b)
    try {
      return zlib.gunzipSync(payload);
    } catch (gzipErr) {
      // Fallback: GZIP_ALT (0x02) and GZIP_BOTH (0x03) frames sometimes use
      // raw zlib deflate format instead of gzip wrapping (#250)
      try {
        return zlib.inflateSync(payload);
      } catch (deflateErr) {
        // Last resort: try raw deflate (no zlib header)
        try {
          return zlib.inflateRawSync(payload);
        } catch (rawErr) {
          debugLog(
            `[DECOMPRESS ERROR] flags=${flags}, payloadSize=${payload.length}, gzip=${gzipErr.message}, deflate=${deflateErr.message}, raw=${rawErr.message}`
          );
          debugLog(
            `[DECOMPRESS ERROR] First 50 bytes (hex):`,
            payload.slice(0, 50).toString("hex")
          );
          debugLog(
            `[DECOMPRESS ERROR] First 50 bytes (utf8):`,
            payload
              .slice(0, 50)
              .toString("utf8")
              .replace(/[^\x20-\x7E]/g, ".")
          );
          // Try to use payload as-is if all decompression methods fail
          return payload;
        }
      }
    }
  }
  return payload;
}

export function createErrorResponse(jsonError) {
  const errorMsg =
    jsonError?.error?.details?.[0]?.debug?.details?.title ||
    jsonError?.error?.details?.[0]?.debug?.details?.detail ||
    jsonError?.error?.message ||
    "API Error";

  const isRateLimit = jsonError?.error?.code === "resource_exhausted";

  return new Response(
    JSON.stringify({
      error: {
        message: errorMsg,
        type: isRateLimit ? "rate_limit_error" : "api_error",
        code: jsonError?.error?.details?.[0]?.debug?.error || "unknown",
      },
    }),
    {
      status: isRateLimit ? HTTP_STATUS.RATE_LIMITED : HTTP_STATUS.BAD_REQUEST,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export type CursorHttpResponse = {
  status: number;
  headers: Record<string, unknown>;
  body: Buffer;
};
