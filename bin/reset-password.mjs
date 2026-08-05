#!/usr/bin/env node

/**
 * Password Reset CLI
 *
 * Usage:
 *   node bin/reset-password.mjs
 *   npx routiform reset-password
 *
 * Resets the dashboard password. Prompts for a new one and writes it to the database
 * directly, bcrypt-hashed, so `/api/auth/login` can verify it.
 *
 * The storage layout below must stay in step with `src/lib/db/core.ts` (file name),
 * `src/lib/dataPaths.ts` (directory) and `src/lib/db/settings.ts` (table and encoding).
 * This script cannot import them — it runs standalone against a built install with no
 * TypeScript loader — so the shapes are duplicated here deliberately.
 *
 * @module bin/reset-password
 */

import { createInterface } from "node:readline";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import bcrypt from "bcryptjs";

/** Mirror of `resolveDataDir` in src/lib/dataPaths.ts. */
function resolveDataDir() {
  const configured = process.env.DATA_DIR?.trim();
  if (configured) return resolve(configured);

  let home;
  try {
    home = homedir();
  } catch {
    home = process.cwd();
  }

  if (process.platform === "win32") {
    return join(process.env.APPDATA || join(home, "AppData", "Roaming"), "routiform");
  }

  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  if (xdg) return join(resolve(xdg), "routiform");

  return join(home, ".routiform");
}

const DATA_DIR = resolveDataDir();
const DB_PATH = join(DATA_DIR, "storage.sqlite");

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise((res) => rl.question(question, res));
}

function generateSecretDigest(input) {
  // bcrypt at cost 10, matching what /api/auth/login compares against.
  return bcrypt.hashSync(input, 10);
}

console.log("\n🔑 Routiform — Password Reset\n");

async function main() {
  if (!existsSync(DB_PATH)) {
    console.error(`❌ Database not found at: ${DB_PATH}`);
    console.error(`   Make sure Routiform has been started at least once.`);
    console.error(`   Or set DATA_DIR env var to your data directory.\n`);
    process.exit(1);
  }

  let Database;
  try {
    Database = (await import("better-sqlite3")).default;
  } catch {
    console.error("❌ better-sqlite3 not installed. Run: npm install");
    process.exit(1);
  }

  const db = new Database(DB_PATH);

  // Settings live in the shared key_value table under the 'settings' namespace, and every
  // value is JSON-encoded — getSettings() runs JSON.parse over each row, so a bare bcrypt
  // hash written without quotes makes the whole settings read throw.
  const readSetting = db.prepare(
    "SELECT value FROM key_value WHERE namespace = 'settings' AND key = ?"
  );
  const writeSetting = db.prepare(
    "INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('settings', ?, ?)"
  );

  const existing = readSetting.get("password");
  if (existing?.value) {
    let stored = null;
    try {
      stored = JSON.parse(existing.value);
    } catch {
      stored = existing.value;
    }
    const looksHashed = typeof stored === "string" && /^\$2[aby]?\$/.test(stored);
    console.log(
      looksHashed
        ? "ℹ️  A password is currently set."
        : "⚠️  A password is set but is not a bcrypt hash, so login can never accept it. " +
            "Resetting now will fix that."
    );
  } else {
    console.log("ℹ️  No password is currently set.");
  }

  const password = await ask("Enter new password (min 4 chars): ");

  if (!password || password.length < 4) {
    console.error("\n❌ Password must be at least 4 characters.\n");
    db.close();
    rl.close();
    process.exit(1);
  }

  const confirm = await ask("Confirm new password: ");

  if (password !== confirm) {
    console.error("\n❌ Passwords do not match.\n");
    db.close();
    rl.close();
    process.exit(1);
  }

  const tx = db.transaction(() => {
    writeSetting.run("password", JSON.stringify(generateSecretDigest(password)));
    writeSetting.run("requireLogin", JSON.stringify(true));
    // Without this the app bounces to onboarding and the new password is never asked for.
    writeSetting.run("setupComplete", JSON.stringify(true));
  });
  tx();

  db.close();
  rl.close();

  console.log("\n✅ Password reset successfully!");
  console.log("   Restart Routiform for changes to take effect.\n");
}

main().catch((err) => {
  console.error(`\n❌ Error: ${err.message}\n`);
  rl.close();
  process.exit(1);
});
