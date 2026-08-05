import { parseModel } from "../model.ts";
import { modelSupportsImages } from "../../translator/model-image-support.ts";

type LogLike = { info: (tag: string, msg: string) => void };

/**
 * Stable partition of combo candidates: those whose target format carries an image first.
 *
 * Reordering only. No candidate is removed, the combo does not change size, and relative order
 * inside each group is preserved — so whatever the strategy decided still holds within the group
 * it decided it for. The point is to spend the first attempt on a model that can actually see the
 * image, instead of discovering the mismatch by regex-matching the provider's rejection.
 *
 * "Capable" comes from `modelSupportsImages`, which resolves the target format and asks the
 * shipped image-support matrix. Unknown formats are not capable — the same policy the matrix
 * already applies, because guessing wrong is silent.
 *
 * Returns the input array **by reference** when the partition would change nothing (everything
 * capable, or nothing capable), so a caller can assert that the untouched path is untouched.
 */
export function partitionByImageSupport(candidates: string[], log?: LogLike): string[] {
  if (!Array.isArray(candidates) || candidates.length < 2) return candidates;

  const capable: string[] = [];
  const incapable: string[] = [];

  for (const candidate of candidates) {
    const parsed = parseModel(candidate);
    const provider = parsed.provider || parsed.providerAlias || "";
    const model = parsed.model || candidate;
    if (provider && modelSupportsImages(provider, model)) capable.push(candidate);
    else incapable.push(candidate);
  }

  if (capable.length === 0 || incapable.length === 0) return candidates;

  log?.info(
    "COMBO",
    `Image pre-flight: ${capable.length}/${candidates.length} candidates carry images, trying those first`
  );
  return [...capable, ...incapable];
}
