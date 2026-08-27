import path from "path";
import os from "os";
import _fs from "fs";

export const APP_NAME = "routiform";

function safeHomeDir() {
  try {
    return os.homedir();
  } catch {
    return process.cwd();
  }
}

function normalizeConfiguredPath(dir: unknown): string | null {
  if (typeof dir !== "string") return null;
  const trimmed = dir.trim();
  if (!trimmed) return null;
  return path.resolve(trimmed);
}

export function getDefaultDataDir() {
  const homeDir = safeHomeDir();

  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
    return path.join(appData, APP_NAME);
  }

  const xdgConfigHome = normalizeConfiguredPath(process.env.XDG_CONFIG_HOME);
  if (xdgConfigHome) {
    return path.join(xdgConfigHome, APP_NAME);
  }

  return path.join(homeDir, `.${APP_NAME}`);
}

/**
 * Test-runner detection: node:test sets NODE_TEST_CONTEXT; vitest sets VITEST / NODE_ENV=test.
 * Tests that import the DB layer write through it, and several suites seed fixtures with
 * placeholder values (e.g. password: "hashed"). When a test file is invoked directly without
 * DATA_DIR set, that used to land in the real ~/.routiform storage and clobber live operator
 * settings. Redirect to the project-local .test-data directory instead. The npm test scripts
 * already set DATA_DIR=.test-data explicitly; this covers direct `node --test <file>` and
 * IDE runner invocations that bypass them.
 */
function isTestRunnerContext(): boolean {
  return (
    process.env.NODE_TEST_CONTEXT !== undefined ||
    process.env.VITEST !== undefined ||
    process.env.NODE_ENV === "test"
  );
}

export function resolveDataDir({ isCloud = false }: { isCloud?: boolean } = {}): string {
  if (isCloud) return "/tmp";

  const configured = normalizeConfiguredPath(process.env.DATA_DIR);
  if (configured) return configured;

  if (isTestRunnerContext()) return path.join(process.cwd(), ".test-data");

  return getDefaultDataDir();
}

export function isSamePath(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const normalizedA = path.resolve(a);
  const normalizedB = path.resolve(b);

  if (process.platform === "win32") {
    return normalizedA.toLowerCase() === normalizedB.toLowerCase();
  }

  return normalizedA === normalizedB;
}
