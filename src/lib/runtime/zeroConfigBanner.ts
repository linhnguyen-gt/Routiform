import fs from "node:fs";

/**
 * Detect typical container runtime (Docker / compatible). Used to avoid noisy
 * zero-config banners — in Docker, keys in DATA_DIR are expected.
 */
export function isDockerLikeRuntime(): boolean {
  if (process.env.DOCKER === "true" || process.env.CONTAINER === "docker") return true;
  try {
    return fs.existsSync("/.dockerenv");
  } catch {
    return false;
  }
}

/**
 * Whether to show the "zero-config mode" dashboard banner after auto-generated secrets.
 * - Default: show on bare-metal / npm when OMNIROUTE_BOOTSTRAPPED is set.
 * - Hidden in Docker-like runtimes unless ROUTIFORM_SHOW_ZERO_CONFIG_BANNER=true.
 */
export function shouldShowZeroConfigBanner(): boolean {
  const v = process.env.ROUTIFORM_SHOW_ZERO_CONFIG_BANNER?.trim().toLowerCase();
  if (v === "false" || v === "0") return false;
  if (v === "true" || v === "1") return true;
  if (isDockerLikeRuntime()) return false;
  return true;
}
