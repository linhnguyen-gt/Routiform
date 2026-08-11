/**
 * Hold a concurrency slot until the response body is actually finished.
 *
 * The round-robin limiter used to release in a `finally` around the call that
 * produces the `Response`, so for streaming traffic the slot freed the moment
 * headers arrived — before a single byte of the body had been read. That made
 * `concurrencyPerModel` close to unenforced for exactly the traffic it exists
 * to pace.
 *
 * Known limitation, deliberate: a client that reads headers and then stops
 * reading now holds its slot until it disconnects. That exposure is bounded by
 * the semaphore's queue cap and applies only to round-robin combos; a slot
 * lease would need a config key the runtime schema currently rejects.
 */
export function releaseOnResponseComplete(response: Response, release: () => void): Response {
  // Nothing to wait for: no body at all, or an error response the caller reads
  // in one go and which the switching loop has already finished with.
  //
  // A locked or disturbed body is also handed back untouched: `pipeTo` would
  // reject without ever acquiring the writable, leaving the returned stream
  // open forever. A leaked slot is a better failure than a hung client.
  if (!response.body || !response.ok || response.body.locked) {
    release();
    return response;
  }

  const { readable, writable } = new TransformStream();

  // `pipeTo` settles on every terminal outcome — the upstream stream ending,
  // the upstream erroring, or the client cancelling its side — so the slot is
  // released exactly once on each. It also preserves backpressure, which an
  // eager reader loop would not: a slow client must not be buffered in memory.
  response.body
    .pipeTo(writable)
    .catch(() => {
      /* upstream error or client cancel — release below either way */
    })
    .finally(release);

  return new Response(readable, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
