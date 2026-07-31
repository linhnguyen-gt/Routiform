import type { CompressionEngine } from "./engine-types.ts";

/**
 * The user-facing compression choice.
 *
 * Deliberately NOT the same type as `StackCompressionResult.mode` (types.ts:1), and the two
 * must not be merged back together however similar they look. This is INPUT — what the operator
 * asked for. `mode` is OUTPUT — what actually ran, after profile gating and the inflation guard
 * had their say. A request configured `aggressive` legitimately reports mode `off` when the
 * guard reverted everything, and collapsing the two would make that state unrepresentable.
 */
export type CompressionPreset = "off" | "safe" | "balanced" | "aggressive" | "custom";

export const COMPRESSION_PRESETS: CompressionPreset[] = [
  "off",
  "safe",
  "balanced",
  "aggressive",
  "custom",
];

export const DEFAULT_COMPRESSION_PRESET: CompressionPreset = "balanced";

function isPreset(value: unknown): value is CompressionPreset {
  return typeof value === "string" && (COMPRESSION_PRESETS as string[]).includes(value);
}

export interface PresetSettingsLike {
  contextValidation?: string | null;
  compressionPreset?: string | null;
  compressionEngines?: Record<string, boolean> | null;
}

/**
 * Resolve the preset for a request from settings.
 *
 * An ABSENT `compressionPreset` resolves to `balanced`, which is the preset containing RTK +
 * Caveman — so an install that upgrades into this code keeps behaving exactly as it did. This
 * is one branch in a reader, not a migration: nothing has ever persisted a compression mode
 * (src/lib/db/settings.ts stores `contextValidation`), so there is no stored value to migrate
 * and writing one on upgrade would be inventing state to replace state that never existed.
 *
 * `contextValidation` remains the on/off switch and is not overloaded: it has its own DB
 * default and its own TTL cache, and a request with compression switched off is `off` whatever
 * preset is stored.
 */
export function resolvePreset(settings: PresetSettingsLike | null | undefined): CompressionPreset {
  if (!settings) return DEFAULT_COMPRESSION_PRESET;

  if (settings.contextValidation != null && settings.contextValidation !== "auto-compress") {
    return "off";
  }

  const stored = settings.compressionPreset;
  if (stored == null) return DEFAULT_COMPRESSION_PRESET;
  if (isPreset(stored)) return stored;

  console.warn(
    `[Compression] unknown compressionPreset ${JSON.stringify(stored)}; falling back to "safe"`
  );
  return "safe";
}

/**
 * The engines a preset selects, preserving registry order.
 *
 * `gateCleared` gates EVERY preset except `aggressive`, lossless engines included. The original
 * design gated only lossy ones, on the theory that a lossless engine cannot hurt — but "lossless"
 * is a claim about bytes, not about outcomes. Collapsing whitespace round-trips as far as the
 * guard is concerned and can still change what a model does with the prompt, so a new lossless
 * engine has to earn its place too.
 *
 * The concrete reason it matters here: `balanced` is what an install with no stored preset
 * resolves to, so anything in `balanced` ships to every upgrade silently. Keeping a brand-new
 * engine out of it is what makes the byte-identical upgrade promise true rather than aspirational.
 *
 * `custom` reads explicit per-engine toggles and selects nothing when there are none — an empty
 * custom configuration means the operator turned everything off, not that they meant `balanced`.
 */
export function presetEngines(
  preset: CompressionPreset,
  engines: readonly CompressionEngine[],
  toggles?: Record<string, boolean> | null
): CompressionEngine[] {
  switch (preset) {
    case "off":
      return [];
    case "safe":
      return engines.filter((e) => e.stage === "lossless" && e.gateCleared);
    case "balanced":
      return engines.filter((e) => e.gateCleared);
    case "aggressive":
      return engines.slice();
    case "custom":
      return engines.filter((e) => toggles?.[e.id] === true);
    default:
      return engines.filter((e) => e.stage === "lossless" && e.gateCleared);
  }
}
