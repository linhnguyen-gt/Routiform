import { NextResponse } from "next/server";
import {
  getComboById,
  updateCombo,
  deleteCombo,
  getComboByName,
  getCombos,
  isCloudEnabled,
} from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { syncToCloud } from "@/lib/cloudSync";
import { validateComboDAG } from "@routiform/open-sse/services/combo.ts";
import { updateComboSchema } from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { validateComboModels, withComboWarnings } from "@/shared/validation/combo-model-validation";
import { loadComboValidationContext } from "@/shared/validation/combo-validation-context";

// GET /api/combos/[id] - Get combo by ID
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const combo = await getComboById(id);

    if (!combo) {
      return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    }

    return NextResponse.json(combo);
  } catch (error) {
    console.log("Error fetching combo:", error);
    return NextResponse.json({ error: "Failed to fetch combo" }, { status: 500 });
  }
}

// PUT /api/combos/[id] - Update combo
export async function PUT(request, { params }) {
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

  try {
    const { id } = await params;
    const validation = validateBody(updateComboSchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const body = validation.data;

    // Check if name already exists (exclude current combo)
    if (body.name) {
      const existing = await getComboByName(body.name);
      if (existing && existing.id !== id) {
        return NextResponse.json({ error: "Combo name already exists" }, { status: 400 });
      }
    }

    // Validate nested combo DAG (no circular references, max depth).
    // Everything model-related lives inside this guard: a body without `models` — what
    // handleToggleCombo and MCPDashboard send — must not run model validation at all, and
    // must never have the stored list validated on its behalf.
    let modelCheck = null;
    if (body.models) {
      const allCombos = await getCombos();
      // Update the combo in the list temporarily for validation
      const updatedCombos = allCombos.map((c) => (c.id === id ? { ...c, ...body } : c));
      const stored = await getComboById(id);
      const comboName = body.name || stored?.name;
      if (typeof comboName === "string") {
        try {
          validateComboDAG(comboName, updatedCombos);
        } catch (dagError) {
          return NextResponse.json({ error: dagError.message }, { status: 400 });
        }
      }

      // Entries the combo already had are exempt from the hard error, so editing only a
      // combo's name never fails on a legacy entry the user did not touch.
      const context = await loadComboValidationContext();
      modelCheck = validateComboModels({
        ...context,
        models: body.models,
        knownComboNames: new Set<string>(allCombos.map((c) => c.name).filter(Boolean) as string[]),
        existingModels: new Set<string>(
          (Array.isArray(stored?.models) ? stored.models : [])
            .map((entry: unknown) => {
              if (typeof entry === "string") return entry;
              if (
                entry &&
                typeof entry === "object" &&
                "model" in entry &&
                typeof entry.model === "string"
              ) {
                return entry.model;
              }
              return undefined;
            })
            .filter((value: unknown): value is string => typeof value === "string")
        ),
      });
      if (modelCheck.errors.length > 0) {
        return NextResponse.json({ error: modelCheck.errors[0] }, { status: 400 });
      }
    }

    const combo = await updateCombo(id, body);

    if (!combo) {
      return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    }

    // Auto sync to Cloud if enabled
    await syncToCloudIfEnabled();

    return NextResponse.json(modelCheck ? withComboWarnings(combo, modelCheck) : combo);
  } catch (error) {
    console.log("Error updating combo:", error);
    return NextResponse.json({ error: "Failed to update combo" }, { status: 500 });
  }
}

// DELETE /api/combos/[id] - Delete combo
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const success = await deleteCombo(id);

    if (!success) {
      return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    }

    // Auto sync to Cloud if enabled
    await syncToCloudIfEnabled();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error deleting combo:", error);
    return NextResponse.json({ error: "Failed to delete combo" }, { status: 500 });
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
