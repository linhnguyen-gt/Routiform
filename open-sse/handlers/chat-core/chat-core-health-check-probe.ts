/**
 * Health-check probes: the single-message requests the test buttons send through the
 * normal chat path to find out whether a model, combo or account answers.
 *
 * They are diagnostics, not traffic. Each test route records its own outcome and reports
 * it to the caller, so a probe must never leave account state behind — probing a model
 * the key cannot use would otherwise disable the account for every other model.
 */

/** Set by /api/models/test, /api/combos/test and /api/providers/[id]/test. */
const PROBE_HEADER = "x-internal-test";
const PROBE_VALUE = "combo-health-check";

type HeadersLike = Headers | Record<string, unknown> | null | undefined;

function readHeader(headers: HeadersLike, name: string): string {
  if (!headers) return "";
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) || "";
  }
  const record = headers as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase() === name && typeof value === "string") return value;
  }
  return "";
}

export function isHealthCheckProbe(
  clientRawRequest: { headers?: HeadersLike } | null | undefined
): boolean {
  return readHeader(clientRawRequest?.headers, PROBE_HEADER) === PROBE_VALUE;
}
