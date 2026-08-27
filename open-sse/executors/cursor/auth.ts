import crypto from "crypto";
import { v5 as uuidv5 } from "uuid";

// Jyh cipher checksum for Cursor API authentication
export function generateChecksum(machineId) {
  const timestamp = Math.floor(Date.now() / 1000000);
  const byteArray = new Uint8Array([
    (timestamp >> 40) & 0xff,
    (timestamp >> 32) & 0xff,
    (timestamp >> 24) & 0xff,
    (timestamp >> 16) & 0xff,
    (timestamp >> 8) & 0xff,
    timestamp & 0xff,
  ]);

  let t = 165;
  for (let i = 0; i < byteArray.length; i++) {
    byteArray[i] = ((byteArray[i] ^ t) + (i % 256)) & 0xff;
    t = byteArray[i];
  }

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let encoded = "";

  for (let i = 0; i < byteArray.length; i += 3) {
    const a = byteArray[i];
    const b = i + 1 < byteArray.length ? byteArray[i + 1] : 0;
    const c = i + 2 < byteArray.length ? byteArray[i + 2] : 0;

    encoded += alphabet[a >> 2];
    encoded += alphabet[((a & 3) << 4) | (b >> 4)];

    if (i + 1 < byteArray.length) {
      encoded += alphabet[((b & 15) << 2) | (c >> 6)];
    }
    if (i + 2 < byteArray.length) {
      encoded += alphabet[c & 63];
    }
  }

  return `${encoded}${machineId}`;
}

export function buildHeaders(credentials) {
  const accessToken = credentials.accessToken;
  const machineId = credentials.providerSpecificData?.machineId;
  const ghostMode = credentials.providerSpecificData?.ghostMode !== false;

  if (!machineId) {
    throw new Error("Machine ID is required for Cursor API");
  }

  const cleanToken = accessToken.includes("::") ? accessToken.split("::")[1] : accessToken;

  return {
    authorization: `Bearer ${cleanToken}`,
    "connect-accept-encoding": "gzip",
    "connect-protocol-version": "1",
    "content-type": "application/connect+proto",
    "user-agent": "connect-es/1.6.1",
    "x-amzn-trace-id": `Root=${crypto.randomUUID()}`,
    "x-client-key": crypto.createHash("sha256").update(cleanToken).digest("hex"),
    "x-cursor-checksum": generateChecksum(machineId),
    "x-cursor-client-version": "2.3.41",
    "x-cursor-client-type": "ide",
    "x-cursor-client-os":
      process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux",
    "x-cursor-client-arch": process.arch === "arm64" ? "aarch64" : "x64",
    "x-cursor-client-device-type": "desktop",
    "x-cursor-config-version": crypto.randomUUID(),
    "x-cursor-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    "x-ghost-mode": ghostMode ? "true" : "false",
    "x-request-id": crypto.randomUUID(),
    "x-session-id": uuidv5(cleanToken, uuidv5.DNS),
  };
}
