/**
 * Built-in models the provider has stopped listing.
 *
 * The registry in `open-sse/config` is hand-maintained while the provider's own catalog
 * moves under it, so an id can outlive the model it names. Nothing notices until a request
 * comes back 404 or 410 — by which point the model has been sitting in the pickers, and in
 * the batch model test, failing every time.
 *
 * This is reported, never acted on. Some providers answer their models endpoint with a
 * curated or paginated subset rather than the whole catalog, and silently retiring an id on
 * that basis would remove models that work. Callers pass `skip: true` for those, and for
 * everyone else the list is a prompt for a human to edit the registry.
 */
/**
 * Providers whose models endpoint answers with something other than their full catalog.
 *
 * `github` and `kiro` are curated whitelists where the sync is the source of truth, and
 * `qoder`'s two built-in ids are a deliberate fallback the live catalog replaces — its
 * listing also omits models flagged `enable:false` that still serve chat. Comparing a
 * registry against any of these produces retirements that are purely an artefact of what
 * the endpoint chose to return.
 */
export const PARTIAL_MODEL_LISTING_PROVIDERS = new Set(["github", "kiro", "qoder"]);

/**
 * Above this share of the registry going missing, the two sides are assumed to disagree
 * about how ids are spelled — a namespace or casing convention drifting apart — rather than
 * the provider having withdrawn nearly everything at once.
 */
const IMPLAUSIBLE_RETIREMENT_RATIO = 0.5;

export function findRetiredRegistryModels({
  registryIds,
  listedModels,
  skip = false,
}: {
  /** Ids the built-in registry claims this provider serves. */
  registryIds: Iterable<string>;
  /** Raw model records the provider's models endpoint just returned. */
  listedModels: unknown[];
  /**
   * True when this listing cannot stand in for the provider's full catalog — a curated
   * provider, or a response the handler served from a local fallback after upstream failed.
   */
  skip?: boolean;
}): string[] {
  if (skip) return [];

  const listedIds = new Set<string>();
  for (const model of listedModels) {
    if (!model || typeof model !== "object") continue;
    const record = model as Record<string, unknown>;
    const id = record.id ?? record.name ?? record.model;
    if (typeof id === "string" && id.length > 0) listedIds.add(id.toLowerCase());
  }

  // An endpoint that returned nothing usable proves nothing about any particular model.
  if (listedIds.size === 0) return [];

  const registry = [...registryIds];
  const retired = registry.filter((id) => !listedIds.has(id.toLowerCase()));
  if (retired.length > registry.length * IMPLAUSIBLE_RETIREMENT_RATIO) return [];
  return retired;
}
