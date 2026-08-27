import { HTTP_STATUS } from "../../config/constants.ts";
import type { CursorHttpResponse } from "./errors.ts";
import { http2 } from "./shared.ts";

export async function makeFetchRequest(
  url: string,
  headers: Record<string, string>,
  body: Uint8Array,
  signal?: AbortSignal
): Promise<CursorHttpResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: body as unknown as BodyInit,
    signal,
  });

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    status: response.status,
    headers: responseHeaders,
    body: Buffer.from(await response.arrayBuffer()),
  };
}

export function makeHttp2Request(
  url: string,
  headers: Record<string, string>,
  body: Uint8Array,
  signal?: AbortSignal
): Promise<CursorHttpResponse> {
  if (!http2) {
    throw new Error("http2 module not available");
  }

  return new Promise<CursorHttpResponse>((resolve, reject) => {
    const urlObj = new URL(url);
    const client = http2.connect(`https://${urlObj.host}`);
    const chunks = [];
    let responseHeaders = {};

    client.on("error", reject);

    const req = client.request({
      ":method": "POST",
      ":path": urlObj.pathname,
      ":authority": urlObj.host,
      ":scheme": "https",
      ...headers,
    });

    req.on("response", (hdrs) => {
      responseHeaders = hdrs;
    });
    req.on("data", (chunk) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      client.close();
      resolve({
        status:
          typeof responseHeaders[":status"] === "number"
            ? responseHeaders[":status"]
            : Number(responseHeaders[":status"] || HTTP_STATUS.SERVER_ERROR),
        headers: responseHeaders,
        body: Buffer.concat(chunks),
      });
    });
    req.on("error", (err) => {
      client.close();
      reject(err);
    });

    if (signal) {
      signal.addEventListener("abort", () => {
        req.close();
        client.close();
        reject(new Error("Request aborted"));
      });
    }

    req.write(body);
    req.end();
  });
}
