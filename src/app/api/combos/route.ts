import { NextResponse } from "next/server";
import { getCombos, createCombo, getComboByName, isCloudEnabled } from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { syncToCloud } from "@/lib/cloudSync";
import { validateComboDAG } from "@routiform/open-sse/services/combo.ts";
import { createComboSchema } from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { validateComboModels, withComboWarnings } from "@/shared/validation/combo-model-validation";
import { loadComboValidationContext } from "@/shared/validation/combo-validation-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/combos - Get all combos
export async function GET() {
  try {
    const combos = await getCombos();
    return NextResponse.json(
      { combos },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.log("Error fetching combos:", error);
    return NextResponse.json({ error: "Failed to fetch combos" }, { status: 500 });
  }
}

// POST /api/combos - Create new combo
export async function POST(request) {
  try {
    const body = await request.json();

    // Zod validation (covers name format, length, etc.)
    const validation = validateBody(createComboSchema, body);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { name, models, strategy, config } = validation.data;

    // Check if name already exists
    const existing = await getComboByName(name);
    if (existing) {
      return NextResponse.json({ error: "Combo name already exists" }, { status: 400 });
    }

    // Validate nested combo DAG (no circular references, max depth)
    const allCombos = await getCombos();
    // Temporarily add the new combo to validate its graph
    const tempCombo = { name, models: models || [], strategy, config };
    try {
      validateComboDAG(name, [...allCombos, tempCombo]);
    } catch (dagError) {
      return NextResponse.json({ error: dagError.message }, { status: 400 });
    }

    // Advisory model check. POST has no prior state, so every entry is new.
    const context = await loadComboValidationContext();
    const modelCheck = validateComboModels({
      ...context,
      models: models || [],
      knownComboNames: new Set(allCombos.map((c) => c.name).filter(Boolean)),
    });
    if (modelCheck.errors.length > 0) {
      return NextResponse.json({ error: modelCheck.errors[0] }, { status: 400 });
    }

    const combo = await createCombo({
      ...validation.data,
      models: models || [],
    });

    // Auto sync to Cloud if enabled
    await syncToCloudIfEnabled();

    return NextResponse.json(withComboWarnings(combo, modelCheck), { status: 201 });
  } catch (error) {
    console.log("Error creating combo:", error);
    return NextResponse.json({ error: "Failed to create combo" }, { status: 500 });
  }
}

/**
 * Sync to Cloud if enabled
 */
async function syncToCloudIfEnabled() {
  try {
    const cloudEnabled = await isCloudEnabled();
    if (!cloudEnabled) return;

    const machineId = await getConsistentMachineId();
    await syncToCloud(machineId);
  } catch (error) {
    console.log("Error syncing to cloud:", error);
  }
}
