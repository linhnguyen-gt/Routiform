import { getSettings, updateSettings } from "@/lib/db/settings";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import {
  addModelReasoningDefaultSchema,
  removeModelReasoningDefaultSchema,
  updateModelReasoningDefaultsSchema,
} from "@/shared/validation/schemas";
import {
  getBuiltInModelReasoningEffortDefaults,
  setCustomModelReasoningEffortDefaults,
} from "@routiform/open-sse/config/registry-params.ts";
import { canonicalizeProviderModelKey } from "@/shared/models/model-string";
import { NextResponse } from "next/server";

/**
 * Collapse a stored map onto canonical provider ids.
 *
 * Keys were previously written in whatever spelling the calling surface used — model
 * pickers emit provider aliases (`ds/...`), the settings form emits ids (`deepseek/...`) —
 * so the same model could hold two entries that never overrode one another.
 *
 * When both spellings collide the LAST one wins. Callers rely on that ordering: the
 * stored map is spread first and the client's edits after it, so an edit to a model that
 * already has a stored default has to be able to overwrite it. Preferring the canonical
 * spelling instead would drop exactly those edits, because the stored copy is the
 * canonical one and the client sends picker spelling.
 */
function canonicalizeDefaults(defaults: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, effort] of Object.entries(defaults)) {
    result[canonicalizeProviderModelKey(key)] = effort;
  }
  return result;
}

async function readDbCustomDefaults(): Promise<Record<string, string>> {
  const settings = await getSettings();
  const raw = settings.modelReasoningDefaults;
  if (!raw) return {};
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? canonicalizeDefaults(parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

async function writeDbCustomDefaults(defaults: Record<string, string>) {
  await updateSettings({ modelReasoningDefaults: defaults });
}

async function snapshot() {
  const dbCustom = await readDbCustomDefaults();
  const builtIn = getBuiltInModelReasoningEffortDefaults();
  return {
    builtIn,
    custom: dbCustom,
    effective: { ...builtIn, ...dbCustom },
  };
}

export async function GET() {
  try {
    return NextResponse.json(await snapshot());
  } catch (error) {
    console.error("[API ERROR] /api/settings/model-defaults GET:", error);
    return NextResponse.json({ error: "Failed to get model defaults" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          message: "Invalid request",
          details: [{ field: "body", message: "Invalid JSON body" }],
        },
      },
      { status: 400 }
    );
  }

  const validation = validateBody(updateModelReasoningDefaultsSchema, rawBody);
  if (isValidationFailure(validation)) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const dbDefaults = await readDbCustomDefaults();
    const merged = canonicalizeDefaults({ ...dbDefaults, ...validation.data.defaults });
    await writeDbCustomDefaults(merged);
    setCustomModelReasoningEffortDefaults(merged);
    return NextResponse.json({ success: true, ...(await snapshot()) });
  } catch (error) {
    console.error("[API ERROR] /api/settings/model-defaults PUT:", error);
    return NextResponse.json({ error: "Failed to update model defaults" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          message: "Invalid request",
          details: [{ field: "body", message: "Invalid JSON body" }],
        },
      },
      { status: 400 }
    );
  }

  const validation = validateBody(addModelReasoningDefaultSchema, rawBody);
  if (isValidationFailure(validation)) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const { provider, model, effort } = validation.data;
    const dbDefaults = await readDbCustomDefaults();
    const key = canonicalizeProviderModelKey(`${provider}/${model}`);
    dbDefaults[key] = effort;
    await writeDbCustomDefaults(dbDefaults);
    setCustomModelReasoningEffortDefaults(dbDefaults);
    return NextResponse.json({ success: true, ...(await snapshot()) });
  } catch (error) {
    console.error("[API ERROR] /api/settings/model-defaults POST:", error);
    return NextResponse.json({ error: "Failed to add model default" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          message: "Invalid request",
          details: [{ field: "body", message: "Invalid JSON body" }],
        },
      },
      { status: 400 }
    );
  }

  const validation = validateBody(removeModelReasoningDefaultSchema, rawBody);
  if (isValidationFailure(validation)) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const { provider, model } = validation.data;
    const dbDefaults = await readDbCustomDefaults();
    const key = canonicalizeProviderModelKey(`${provider}/${model}`);
    delete dbDefaults[key];
    await writeDbCustomDefaults(dbDefaults);
    setCustomModelReasoningEffortDefaults(dbDefaults);
    return NextResponse.json({ success: true, ...(await snapshot()) });
  } catch (error) {
    console.error("[API ERROR] /api/settings/model-defaults DELETE:", error);
    return NextResponse.json({ error: "Failed to remove model default" }, { status: 500 });
  }
}
