import { getModelAliases, getProviderNodes, getSettings } from "@/lib/localDb";

/**
 * Loads the three stores the combo save-path validator consults. Shared by
 * `POST /api/combos` and `PUT /api/combos/[id]` so the two cannot drift.
 *
 * FAIL OPEN. If we cannot load provider nodes we cannot distinguish a custom-node
 * prefix from a typo, and this is an advisory check on a save the user explicitly
 * asked for. Blocking every custom-node combo on a transient read failure is worse
 * than skipping one advisory pass; the router still validates at request time.
 * NOTE: the chat route makes the OPPOSITE choice on purpose — there, the same
 * uncertainty leads to credential misdispatch. Do not unify these.
 */
export interface ComboValidationContext {
  knownNodePrefixes: Set<string> | null;
  knownModelAliases: Set<string> | null;
  stripModelPrefix: boolean;
}

export async function loadComboValidationContext(): Promise<ComboValidationContext> {
  const [knownNodePrefixes, knownModelAliases, stripModelPrefix] = await Promise.all([
    loadNodePrefixes(),
    loadModelAliases(),
    loadStripModelPrefix(),
  ]);
  return { knownNodePrefixes, knownModelAliases, stripModelPrefix };
}

/** Only the two node types the router itself scans (`src/sse/services/model.ts:48-68`). */
async function loadNodePrefixes(): Promise<Set<string> | null> {
  try {
    const [openaiNodes, anthropicNodes] = await Promise.all([
      getProviderNodes({ type: "openai-compatible" }),
      getProviderNodes({ type: "anthropic-compatible" }),
    ]);
    const prefixes = new Set<string>();
    for (const node of [...openaiNodes, ...anthropicNodes]) {
      if (typeof node?.prefix === "string" && node.prefix) prefixes.add(node.prefix);
    }
    return prefixes;
  } catch {
    return null;
  }
}

/** Alias keys have no format constraint, so one may itself contain a slash. */
async function loadModelAliases(): Promise<Set<string> | null> {
  try {
    const aliases = await getModelAliases();
    return new Set(Object.keys(aliases || {}));
  } catch {
    return null;
  }
}

/** Read failure defaults to `false`, keeping the stricter behaviour for the common case. */
async function loadStripModelPrefix(): Promise<boolean> {
  try {
    const settings = await getSettings();
    return settings?.stripModelPrefix === true;
  } catch {
    return false;
  }
}
