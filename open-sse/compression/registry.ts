import { ENGINE_STAGES } from "./engine-types.ts";
import { ENGINE_CATALOG } from "./engine-catalog.ts";
import type { CompressionEngine, EngineContext, EngineStage } from "./engine-types.ts";
import { presetEngines } from "./preset.ts";
import type { CompressionPreset } from "./preset.ts";
import { liteEngine } from "./engines/lite.ts";
import { rtkEngine } from "./engines/rtk-engine.ts";
import { cavemanEngine } from "./engines/caveman-engine.ts";

/**
 * The compression engine registry.
 *
 * Adding an engine is one new file plus one line here — which is the entire point of the phase.
 * Before this, RTK and Caveman were called by name in sequence, so every new engine meant
 * editing the orchestrator and every ordering question was answered by where someone happened
 * to put the call.
 */

const BUILTINS: readonly CompressionEngine[] = [liteEngine, rtkEngine, cavemanEngine];

export const BUILTIN_ENGINE_IDS: string[] = BUILTINS.map((e) => e.id);

let engines = new Map<string, CompressionEngine>();

const STAGE_RANK: Record<EngineStage, number> = { lossless: 0, lossy: 1 };

/**
 * Stage is the primary sort key, so a lossy engine cannot place itself ahead of a lossless one
 * however low an `order` it declares. That is the invariant rather than a runtime check because
 * a check can be forgotten and a sort key cannot: lossy engines discard information the lossless
 * ones would otherwise have compressed losslessly, so running them first throws away savings and
 * makes the lossless engines' round-trip guarantee meaningless.
 */
function sortEngines(list: CompressionEngine[]): CompressionEngine[] {
  return list.sort(
    (a, b) =>
      STAGE_RANK[a.stage] - STAGE_RANK[b.stage] || a.order - b.order || a.id.localeCompare(b.id)
  );
}

export function registerEngine(engine: CompressionEngine): void {
  if (!engine || typeof engine.id !== "string" || engine.id.length === 0) {
    throw new Error("[Compression] engine must have a non-empty id");
  }
  if (!ENGINE_STAGES.includes(engine.stage)) {
    throw new Error(
      `[Compression] engine "${engine.id}" declares unknown stage ${JSON.stringify(engine.stage)}; ` +
        `expected one of ${ENGINE_STAGES.join(", ")}`
    );
  }
  if (engines.has(engine.id)) {
    throw new Error(`[Compression] engine "${engine.id}" is already registered`);
  }
  engines.set(engine.id, engine);
}

/** All registered engines, in execution order. */
export function listEngines(): CompressionEngine[] {
  return sortEngines([...engines.values()]);
}

export function getEngine(id: string): CompressionEngine | undefined {
  return engines.get(id);
}

/** Test seam: restore the registry to exactly the built-in set. */
export function resetRegistryToBuiltins(): void {
  engines = new Map(BUILTINS.map((e) => [e.id, e]));
}

/**
 * Engines that both the preset selects and the request supports.
 *
 * Two separate filters on purpose: the preset is what the operator asked for, `supports()` is
 * what this particular body can accept. An engine dropped by the second is not a configuration
 * error and must not be reported as one.
 */
export function selectEngines(
  preset: CompressionPreset,
  ctx: EngineContext,
  toggles?: Record<string, boolean> | null
): CompressionEngine[] {
  return presetEngines(preset, listEngines(), toggles).filter((engine) => engine.supports(ctx));
}

/**
 * The catalog is what the MCP tool advertises; the registry is what actually runs. They are two
 * files precisely so the MCP surface does not have to import the engines — which means nothing
 * but this check stops them drifting apart.
 */
function assertCatalogMatchesRegistry(): void {
  const registered = listEngines();
  const mismatch =
    registered.length !== ENGINE_CATALOG.length ||
    registered.some((engine, i) => {
      const described = ENGINE_CATALOG[i];
      return (
        !described ||
        described.id !== engine.id ||
        described.stage !== engine.stage ||
        described.order !== engine.order ||
        described.gateCleared !== engine.gateCleared
      );
    });

  if (mismatch) {
    throw new Error(
      "[Compression] engine-catalog.ts does not match the registered engines. " +
        `Registered: ${registered.map((e) => `${e.id}/${e.stage}/${e.order}/${e.gateCleared}`).join(", ")}. ` +
        "Update the catalog — it is what the MCP surface advertises."
    );
  }
}

resetRegistryToBuiltins();
assertCatalogMatchesRegistry();
