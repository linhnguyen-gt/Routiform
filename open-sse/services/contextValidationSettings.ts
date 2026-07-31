/**
 * UI-driven proxy context compression toggle.
 * Reads from settings DB with short TTL to avoid per-request SQLite hits.
 */

import type { CavemanOutputLevel } from "../compression/types.ts";
import { resolvePreset } from "../compression/preset.ts";
import type { CompressionPreset } from "../compression/preset.ts";

type CacheEntry = { value: boolean; at: number };
type LevelCacheEntry = { value: CavemanOutputLevel; at: number };
type PresetCacheEntry = {
  value: { preset: CompressionPreset; engines: Record<string, boolean> | null };
  at: number;
};

const TTL_MS = 4000;
let cache: CacheEntry | null = null;
let cavemanOutputCache: LevelCacheEntry | null = null;
let compressionPresetCache: PresetCacheEntry | null = null;

export function invalidateContextValidationSettingsCache(): void {
  cache = null;
  cavemanOutputCache = null;
  compressionPresetCache = null;
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

/**
 * Which engine set this install runs, plus any per-engine toggles.
 *
 * An absent `compressionPreset` resolves to `balanced` — see preset.ts. This is a read-time
 * resolution and not a migration: no compression mode has ever been persisted, so there is no
 * stored value to convert, and writing one on upgrade would invent state to replace state that
 * never existed.
 */
export async function getCompressionPreset(): Promise<{
  preset: CompressionPreset;
  engines: Record<string, boolean> | null;
}> {
  const now = Date.now();
  if (compressionPresetCache && now - compressionPresetCache.at < TTL_MS) {
    return compressionPresetCache.value;
  }

  const { getSettings } = await import("@/lib/db/settings");
  const settings = (await getSettings()) as {
    contextValidation?: string;
    compressionPreset?: string;
    compressionEngines?: Record<string, boolean>;
  };
  const value = {
    preset: resolvePreset(settings),
    engines: settings.compressionEngines ?? null,
  };
  compressionPresetCache = { value, at: now };
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
