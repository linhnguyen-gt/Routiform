import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";
import { updateSettingsSchema } from "@/shared/validation/settingsSchemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { ENGINE_CATALOG } from "../../../../open-sse/compression/engine-catalog";
import {
  COMPRESSION_PRESETS,
  DEFAULT_COMPRESSION_PRESET,
  presetEngines,
  resolvePreset,
} from "../../../../open-sse/compression/preset";
import { invalidateContextValidationSettingsCache } from "../../../../open-sse/services/contextValidationSettings";

/**
 * The compression control surface.
 *
 * It exists because `routiform_get_compression_info` was answering from a hardcoded literal — it
 * described a stack rather than reading one, so it could go stale without anything failing. This
 * route reads the real catalog and the real settings, and the MCP tool and CLI both point here.
 *
 * `gateCleared` is surfaced per engine, and it is the field that explains the UI: an engine that
 * has not been measured renders disabled WITH ITS REASON, rather than simply missing. A control
 * that silently omits an option teaches the operator nothing about why.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

interface CompressionSettingsShape {
  contextValidation?: string;
  compressionPreset?: string;
  compressionEngines?: Record<string, boolean>;
}

export async function GET() {
  try {
    const settings = (await getSettings()) as CompressionSettingsShape;
    const preset = resolvePreset(settings);
    const toggles = settings.compressionEngines ?? null;

    // The catalog is pure data with no runtime dependency on the engines, and the registry asserts
    // at startup that the two still agree — so reading it here cannot drift from what actually runs.
    const active = new Set(presetEngines(preset, ENGINE_CATALOG, toggles).map((e) => e.id));

    return NextResponse.json(
      {
        enabled: settings.contextValidation === "auto-compress",
        preset,
        defaultPreset: DEFAULT_COMPRESSION_PRESET,
        presets: COMPRESSION_PRESETS,
        engines: ENGINE_CATALOG.map((entry) => ({
          ...entry,
          active: active.has(entry.id),
          // Null rather than 0: nothing has been measured yet, and 0 would read as "measured and
          // scored zero", which is a different and much worse claim.
          evalScore: null,
          evalRunAt: null,
        })),
        header: "X-Routiform-Compression",
        overrideHeader: "X-Routiform-Compression-Mode",
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: { code: "COMPRESSION_READ_FAILED", message } },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    // Reuses the settings schema rather than defining a parallel one, so a field cannot be
    // accepted here in a shape the settings writer would reject.
    const validated = validateBody(updateSettingsSchema, {
      ...(body.preset !== undefined ? { compressionPreset: body.preset } : {}),
      ...(body.engines !== undefined ? { compressionEngines: body.engines } : {}),
    });
    if (isValidationFailure(validated)) {
      return NextResponse.json(
        { error: validated.error },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (Object.keys(validated.data).length === 0) {
      return NextResponse.json(
        {
          error: {
            code: "NOTHING_TO_UPDATE",
            message: "supply `preset` and/or `engines`",
          },
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    await updateSettings(validated.data);
    // The reader caches for 4s; without this the caller sees its own write not take effect and
    // retries, which looks like a bug in the write rather than a stale read.
    invalidateContextValidationSettingsCache();

    const settings = (await getSettings()) as CompressionSettingsShape;
    return NextResponse.json(
      { preset: resolvePreset(settings), engines: settings.compressionEngines ?? null },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: { code: "COMPRESSION_UPDATE_FAILED", message } },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
