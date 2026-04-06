/**
 * Field-Level Encryption — AES-256-GCM
 *
 * Encrypts/decrypts sensitive fields (API keys, tokens) stored in SQLite.
 * Format: `enc:v1:<iv_hex>:<ciphertext_hex>:<authTag_hex>`
 *
 * If STORAGE_ENCRYPTION_KEY is not set, operates in passthrough mode
 * (stores plaintext for development convenience).
 *
 * Decryption tries multiple key candidates when `STORAGE_ENCRYPTION_KEY` fails
 * (wrong key after rotation / merged DB): set STORAGE_ENCRYPTION_KEY_LEGACY and/or
 * STORAGE_ENCRYPTION_KEYS (comma-separated) to previous secrets.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const KDF_SALT = "omniroute-field-encryption-v1";

/** Prefix for AES-GCM field blobs; exported to detect failed decrypt (wrong key / corrupted row). */
export const FIELD_ENCRYPTED_VALUE_PREFIX = "enc:v1:" as const;
const PREFIX = FIELD_ENCRYPTED_VALUE_PREFIX;

/** Per-secret derived keys (scrypt is expensive; secrets are few). */
const derivedKeyCache = new Map<string, Buffer>();

/** Connection object with potentially encrypted credential fields. */
export interface ConnectionFields {
  apiKey?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  idToken?: string | null;
  [key: string]: unknown;
}

function deriveKey(secret: string): Buffer {
  const hit = derivedKeyCache.get(secret);
  if (hit) return hit;
  const k = scryptSync(secret, KDF_SALT, KEY_LENGTH);
  derivedKeyCache.set(secret, k);
  return k;
}

/**
 * Primary encryption key (STORAGE_ENCRYPTION_KEY). Used for new encrypt() writes.
 */
function getPrimaryDerivedKey(): Buffer | null {
  const secret = process.env.STORAGE_ENCRYPTION_KEY;
  if (!secret || typeof secret !== "string" || !secret.trim()) return null;
  return deriveKey(secret.trim());
}

/** Check if encryption is enabled. */
export function isEncryptionEnabled(): boolean {
  return !!getPrimaryDerivedKey();
}

/**
 * Collect unique secret strings to try when decrypting (order matters).
 */
function collectDecryptSecretCandidates(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string | undefined) => {
    if (!raw || typeof raw !== "string") return;
    const s = raw.trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };

  push(process.env.STORAGE_ENCRYPTION_KEY);
  push(process.env.STORAGE_ENCRYPTION_KEY_LEGACY);

  const multi = process.env.STORAGE_ENCRYPTION_KEYS;
  if (multi && typeof multi === "string") {
    for (const part of multi.split(",")) {
      push(part);
    }
  }

  return out;
}

function decryptEncV1Body(bodyAfterPrefix: string, key: Buffer): string | null {
  const parts = bodyAfterPrefix.split(":");
  if (parts.length !== 3) return null;
  const [ivHex, encryptedHex, authTagHex] = parts;
  try {
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return null;
  }
}

/**
 * Encrypt a plaintext string. Returns ciphertext with prefix.
 * If encryption is not configured, returns plaintext unchanged.
 */
export function encrypt(plaintext: string | null | undefined): string | null | undefined {
  if (!plaintext || typeof plaintext !== "string") return plaintext;

  const key = getPrimaryDerivedKey();
  if (!key) return plaintext; // passthrough mode

  // Already encrypted — don't double-encrypt
  if (plaintext.startsWith(PREFIX)) return plaintext;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${PREFIX}${iv.toString("hex")}:${encrypted}:${authTag}`;
}

/**
 * Decrypt a ciphertext string. If not encrypted (no prefix), returns as-is.
 * Tries STORAGE_ENCRYPTION_KEY, then STORAGE_ENCRYPTION_KEY_LEGACY, then STORAGE_ENCRYPTION_KEYS.
 */
export function decrypt(ciphertext: string | null | undefined): string | null | undefined {
  if (!ciphertext || typeof ciphertext !== "string") return ciphertext;

  // Not encrypted — return as-is (legacy plaintext or passthrough mode)
  if (!ciphertext.startsWith(PREFIX)) return ciphertext;

  const body = ciphertext.slice(PREFIX.length);
  const secrets = collectDecryptSecretCandidates();

  if (secrets.length === 0) {
    console.warn(
      "[Encryption] Found encrypted data but no STORAGE_ENCRYPTION_KEY (or legacy keys) is set. Cannot decrypt."
    );
    return ciphertext;
  }

  for (let i = 0; i < secrets.length; i++) {
    const key = deriveKey(secrets[i]);
    const plain = decryptEncV1Body(body, key);
    if (plain !== null) {
      if (i > 0) {
        console.info(
          `[Encryption] Decrypted using fallback key #${i + 1}/${secrets.length}. Re-save credentials in Dashboard → Providers to re-encrypt with STORAGE_ENCRYPTION_KEY only.`
        );
      }
      return plain;
    }
  }

  console.error(
    `[Encryption] Decryption failed: no key matched ciphertext (tried ${secrets.length} candidate secret(s)). Set STORAGE_ENCRYPTION_KEY_LEGACY to a previous secret, or re-save API keys in the dashboard.`
  );
  return ciphertext;
}

/**
 * Encrypt sensitive fields in a connection object (mutates in-place).
 */
export function encryptConnectionFields<T extends ConnectionFields | null | undefined>(conn: T): T {
  if (!isEncryptionEnabled()) return conn;
  if (!conn) return conn;

  if (conn.apiKey) conn.apiKey = encrypt(conn.apiKey);
  if (conn.accessToken) conn.accessToken = encrypt(conn.accessToken);
  if (conn.refreshToken) conn.refreshToken = encrypt(conn.refreshToken);
  if (conn.idToken) conn.idToken = encrypt(conn.idToken);
  return conn;
}

/**
 * Decrypt sensitive fields in a connection row (returns new object).
 * Always runs decrypt() so rows written under encryption still decode if STORAGE_ENCRYPTION_KEY
 * was later cleared. If decryption fails, the field is still `enc:v1:…` — we set null so we
 * never send ciphertext to providers (OpenRouter 401 "Missing Authentication header").
 */
export function decryptConnectionFields<T extends ConnectionFields | null | undefined>(row: T): T {
  if (!row) return row;

  const unwrap = (value: string | null | undefined): string | null | undefined => {
    const v = decrypt(value);
    if (v == null || typeof v !== "string") return v;
    if (v.startsWith(FIELD_ENCRYPTED_VALUE_PREFIX)) {
      console.error(
        "[Encryption] Credential field failed to decrypt after trying all configured keys. " +
          "If you moved only storage.sqlite, copy the whole DATA_DIR (at least server.env next to the DB). " +
          "Or set STORAGE_ENCRYPTION_KEY from the old machine's server.env. See docs/BACKUP_AND_RESTORE.md"
      );
      return null;
    }
    return v;
  };

  return {
    ...row,
    apiKey: unwrap(row.apiKey),
    accessToken: unwrap(row.accessToken),
    refreshToken: unwrap(row.refreshToken),
    idToken: unwrap(row.idToken),
  };
}
