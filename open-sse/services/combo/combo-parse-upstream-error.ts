/**
 * Extract error details from a non-OK upstream Response body.
 *
 * Two strings come out of this, and they are not interchangeable:
 *
 * - `errorText` is the raw upstream body (capped at 500 chars) or the parsed
 *   message when the body was a well-formed error envelope. It feeds error
 *   classification (`checkFallbackError`, the all-accounts-rate-limited sniff,
 *   the bad-request-fallback patterns) and the server logs. It must stay raw,
 *   because the classifiers match on provider wording.
 * - `clientMessage` is what the exhausted-combo response returns to the caller.
 *   An unparsed upstream body is provider-controlled and routinely carries
 *   org/project/billing identifiers, internal hostnames, or a partial key echo,
 *   and this proxy is the trust boundary between many API-key holders and one
 *   set of shared provider credentials.
 *
 * This covers the exhausted path only. A *terminal* upstream error — one that
 * stops the chain rather than falling through — is still forwarded to the
 * client as the upstream `Response` itself, body included
 * (`combo-standard-retry-outcome.ts`, `combo-rr-inner-retries.ts`). That
 * pass-through is recorded in `plans/260810-1739-combo-routing-resilience/`.
 */
export async function readUpstreamErrorFromResponse(result: Response): Promise<{
  errorText: string;
  clientMessage: string;
  retryAfter: unknown;
}> {
  let errorText = result.statusText || "";
  let parsedMessage: string | null = null;
  let retryAfter: unknown = null;
  try {
    const cloned = result.clone();
    try {
      const text = await cloned.text();
      if (text) {
        errorText = text.substring(0, 500);
        const errorBody = JSON.parse(text) as {
          error?: { message?: string } | string;
          message?: string;
          retryAfter?: unknown;
        };
        const ebErr = errorBody?.error;
        const fromErr =
          typeof ebErr === "object" && ebErr && typeof ebErr.message === "string"
            ? ebErr.message
            : typeof ebErr === "string"
              ? ebErr
              : undefined;
        const fromBody = fromErr || errorBody?.message;
        errorText = fromBody || errorText;
        parsedMessage = typeof fromBody === "string" && fromBody ? fromBody : null;
        retryAfter = errorBody?.retryAfter || null;
      }
    } catch {
      /* Clone parse failed */
    }
  } catch {
    /* Clone failed */
  }

  if (typeof errorText !== "string") {
    try {
      errorText = JSON.stringify(errorText);
    } catch {
      errorText = String(errorText);
    }
  }

  return {
    errorText,
    clientMessage: parsedMessage || `Upstream error ${result.status}`,
    retryAfter,
  };
}
