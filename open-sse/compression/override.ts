import { COMPRESSION_PRESETS } from "./preset.ts";
import type { CompressionPreset } from "./preset.ts";

/**
 * Per-request compression override.
 *
 * The eval harness cannot measure anything without this. Compression is applied unconditionally
 * from global settings, so an "uncompressed baseline" request would be compressed by whatever the
 * instance happens to be configured to do, and the compressed arm would be compressed twice. Both
 * arms end up equally degraded, every engine passes the fidelity gate, and the harness certifies
 * everything it measures — the exact dishonesty the gate exists to prevent, reproduced inside the
 * instrument.
 *
 * Header rather than a body field: it has to work identically for every body shape the gateway
 * accepts, and it must not perturb the payload being measured.
 *
 *   X-Routiform-Compression-Mode: off
 *   X-Routiform-Compression-Mode: preset:safe
 *   X-Routiform-Compression-Mode: engines:lite,rtk
 *
 * DEFAULT DENY. Turning compression off is a cost regression anyone could otherwise trigger on a
 * production gateway by adding a header, so the override is a capability rather than a switch: an
 * unlisted caller's header is ignored entirely, and ignored loudly enough to debug.
 *
 * The allowlist is API-key ids today. Per-key SCOPES are the right home for this and do not exist
 * yet — there is no scope column on api keys until the later phases add one — so this is
 * deliberately the narrower mechanism rather than a scope check written against a field that would
 * silently evaluate to undefined.
 */

export const OVERRIDE_HEADER = "x-routiform-compression-mode";
export const OVERRIDE_ALLOWLIST_ENV = "COMPRESSION_OVERRIDE_API_KEY_IDS";

export interface CompressionOverride {
  preset?: CompressionPreset;
  engineIds?: string[];
}

export type OverrideOutcome =
  | { status: "absent" }
  | { status: "applied"; override: CompressionOverride }
  | { status: "denied"; reason: string }
  | { status: "invalid"; reason: string };

type HeaderLike =
  | Headers
  | Record<string, string | string[] | undefined>
  | { get?: (name: string) => string | null }
  | null
  | undefined;

function readHeader(headers: HeaderLike, name: string): string | null {
  if (!headers) return null;

  const getter = (headers as Headers).get;
  if (typeof getter === "function") return (headers as Headers).get(name);

  const record = headers as Record<string, string | string[] | undefined>;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase() !== wanted) continue;
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  }
  return null;
}

function allowedKeyIds(): Set<string> {
  const raw = process.env[OVERRIDE_ALLOWLIST_ENV];
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

function parseValue(raw: string): OverrideOutcome {
  const value = raw.trim();

  if (value.toLowerCase() === "off") {
    return { status: "applied", override: { preset: "off" } };
  }

  if (value.toLowerCase().startsWith("preset:")) {
    const name = value.slice("preset:".length).trim();
    if (!(COMPRESSION_PRESETS as string[]).includes(name)) {
      return { status: "invalid", reason: `unknown preset "${name}"` };
    }
    return { status: "applied", override: { preset: name as CompressionPreset } };
  }

  if (value.toLowerCase().startsWith("engines:")) {
    const ids = value
      .slice("engines:".length)
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      return { status: "invalid", reason: "engines: listed no engine ids" };
    }
    // `custom` with an explicit id list, which is exactly what the registry's custom preset means.
    return { status: "applied", override: { preset: "custom", engineIds: ids } };
  }

  return { status: "invalid", reason: `unrecognised value "${value.slice(0, 40)}"` };
}

/**
 * Resolve the override for a request.
 *
 * An unauthorised header is `denied`, never silently ignored and never partially honoured: a
 * caller that believes it disabled compression while the gateway kept compressing would produce a
 * measurement that looks valid and is not.
 */
export function resolveCompressionOverride(
  headers: HeaderLike,
  apiKeyId: string | null | undefined
): OverrideOutcome {
  const raw = readHeader(headers, OVERRIDE_HEADER);
  if (!raw || !raw.trim()) return { status: "absent" };

  const allowed = allowedKeyIds();
  if (allowed.size === 0) {
    return {
      status: "denied",
      reason: `${OVERRIDE_ALLOWLIST_ENV} is unset, so no caller may override compression`,
    };
  }
  if (!apiKeyId || !allowed.has(apiKeyId)) {
    return { status: "denied", reason: "api key is not on the compression-override allowlist" };
  }

  return parseValue(raw);
}

/** Turn an override into the engine-selection options the pipeline takes. */
export function overrideToStackOptions(override: CompressionOverride): {
  preset: CompressionPreset;
  engineToggles: Record<string, boolean> | null;
} {
  if (!override.engineIds) {
    return { preset: override.preset ?? "balanced", engineToggles: null };
  }
  return {
    preset: "custom",
    engineToggles: Object.fromEntries(override.engineIds.map((id) => [id, true])),
  };
}
