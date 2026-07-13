/**
 * UI-driven proxy context compression toggle.
 * Reads from settings DB with short TTL to avoid per-request SQLite hits.
 */

import type { CavemanOutputLevel } from "../compression/types.ts";

type CacheEntry = { value: boolean; at: number };
type LevelCacheEntry = { value: CavemanOutputLevel; at: number };

const TTL_MS = 4000;
let cache: CacheEntry | null = null;
let cavemanOutputCache: LevelCacheEntry | null = null;

export function invalidateContextValidationSettingsCache(): void {
  cache = null;
  cavemanOutputCache = null;
}

/**
 * When true, RTK may losslessly shave large tool_result bodies before upstream dispatch.
 * Reads from DB `contextValidation` setting (managed via UI).
 */
export async function isProxyContextCompressionEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) {
    return cache.value;
  }

  const { getSettings } = await import("@/lib/db/settings");
  const settings = await getSettings();
  const mode = (settings as { contextValidation?: string }).contextValidation;
  const value = mode === "auto-compress";
  cache = { value, at: now };
  return value;
}

const CAVEMAN_OUTPUT_LEVELS: readonly CavemanOutputLevel[] = ["off", "lite", "full"];

/**
 * Output-side terseness directive level, injected into the system prompt.
 * Independent of `contextValidation`: input-side compression and output-side
 * terseness are opted into separately.
 */
export async function getCavemanOutputLevel(): Promise<CavemanOutputLevel> {
  const now = Date.now();
  if (cavemanOutputCache && now - cavemanOutputCache.at < TTL_MS) {
    return cavemanOutputCache.value;
  }

  const { getSettings } = await import("@/lib/db/settings");
  const settings = await getSettings();
  const raw = (settings as { cavemanOutputLevel?: string }).cavemanOutputLevel;
  const value = CAVEMAN_OUTPUT_LEVELS.includes(raw as CavemanOutputLevel)
    ? (raw as CavemanOutputLevel)
    : "off";
  cavemanOutputCache = { value, at: now };
  return value;
}
