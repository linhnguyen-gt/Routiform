import { test } from "node:test";
import assert from "node:assert/strict";

test("decrypt tries LEGACY when primary secret is wrong", async () => {
  const { encrypt, decrypt } = await import("../../src/lib/db/encryption.ts");

  const good = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const wrong = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  process.env.STORAGE_ENCRYPTION_KEY = good;
  process.env.STORAGE_ENCRYPTION_KEY_LEGACY = "";

  const secret = "sk-or-test-key-please-ignore";
  const blob = encrypt(secret);
  assert.ok(String(blob).startsWith("enc:v1:"));

  process.env.STORAGE_ENCRYPTION_KEY = wrong;
  process.env.STORAGE_ENCRYPTION_KEY_LEGACY = good;

  const out = decrypt(blob);
  assert.strictEqual(out, secret);

  delete process.env.STORAGE_ENCRYPTION_KEY_LEGACY;
  process.env.STORAGE_ENCRYPTION_KEY = good;
});
