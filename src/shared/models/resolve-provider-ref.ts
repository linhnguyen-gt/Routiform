/**
 * Resolve the head of a `provider/model` string to whatever the router would
 * resolve it to.
 *
 * Resolution order mirrors `src/sse/services/model.ts:48-75` exactly:
 * custom provider-node rows are checked FIRST (matched on their user-defined
 * `prefix`), and only then the provider registry. A ref that is both a node
 * prefix and a provider alias therefore resolves as a NODE, because
 * `getModelInfo` returns from the node branch before reaching the registry.
 *
 * The function is pure and client-safe: node prefixes are INJECTED by the
 * caller, never read here. Each caller owns its own `getProviderNodes()` call
 * and its own failure policy for that read.
 */

import { PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import { getProviderByAlias } from "@/shared/constants/providers";

export type ProviderRefResolution =
  | { kind: "node"; nodeId: string } // provider_nodes row matched by `prefix`
  | { kind: "provider"; providerId: string } // AI_PROVIDERS / PROVIDER_ID_TO_ALIAS
  | { kind: "unknown" };

const UNKNOWN: ProviderRefResolution = { kind: "unknown" };

/** Every provider id and every provider alias the open-sse registry knows. */
const REGISTRY_REFS: ReadonlyMap<string, string> = (() => {
  const refs = new Map<string, string>();
  for (const [providerId, alias] of Object.entries(PROVIDER_ID_TO_ALIAS)) {
    refs.set(providerId, providerId);
    if (alias) refs.set(alias, providerId);
  }
  return refs;
})();

/**
 * @param providerRef  Text before the first slash of a model string.
 * @param nodePrefixes Provider-node prefixes. A `Map` maps prefix → node id; a
 *                     `Set` carries prefixes only, and the prefix is reported
 *                     as the node id.
 */
export function resolveProviderRef(
  providerRef: string,
  nodePrefixes: ReadonlySet<string> | ReadonlyMap<string, string>
): ProviderRefResolution {
  if (!providerRef || typeof providerRef !== "string") return UNKNOWN;

  // 1. Provider-node rows win — see src/sse/services/model.ts:48-68.
  if (nodePrefixes instanceof Map) {
    const nodeId = nodePrefixes.get(providerRef);
    if (nodeId !== undefined) return { kind: "node", nodeId };
  } else if (nodePrefixes instanceof Set && nodePrefixes.has(providerRef)) {
    return { kind: "node", nodeId: providerRef };
  }

  // 2. Registry providers, by id or alias.
  const registryId = REGISTRY_REFS.get(providerRef);
  if (registryId !== undefined) return { kind: "provider", providerId: registryId };

  const provider = getProviderByAlias(providerRef);
  if (provider) return { kind: "provider", providerId: provider.id };

  // 3. Anything else is a vendor prefix (`meta/…`) or plain junk.
  return UNKNOWN;
}
