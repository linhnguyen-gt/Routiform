/** Overlap dedupe only inspects the last 8KB of previously accumulated text. */
const MAX_OVERLAP_SCAN_CHARS = 8 * 1024;

function appendTextPart(parts, chunk) {
  if (typeof chunk !== "string" || chunk.length === 0) return;
  const lastIndex = parts.length - 1;
  if (lastIndex < 0) {
    parts.push(chunk);
    return;
  }

  const previous = parts[lastIndex];

  // Some upstreams send cumulative snapshots instead of true deltas.
  // Prefer the latest snapshot instead of duplicating text.
  if (chunk === previous) return;
  if (chunk.startsWith(previous)) {
    parts[lastIndex] = chunk;
    return;
  }

  // Deduplicate overlap when snapshots partially repeat prior output.
  // Only the tail of `previous` is scanned: comparing against the full history
  // is quadratic for long streams, and a repeated prefix longer than the
  // window is a pathological upstream we accept duplicating instead of
  // burning O(n²) time on.
  const maxOverlap = Math.min(previous.length, chunk.length, MAX_OVERLAP_SCAN_CHARS);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (previous.slice(previous.length - overlap) === chunk.slice(0, overlap)) {
      parts.push(chunk.slice(overlap));
      return;
    }
  }

  parts.push(chunk);
}

function collapseExactDuplicateMessage(text) {
  let value = typeof text === "string" ? text : "";
  for (let pass = 0; pass < 3; pass += 1) {
    const len = value.length;
    if (len < 4) break;

    let collapsed = false;
    const mid = Math.floor(len / 2);
    for (let offset = -3; offset <= 3; offset += 1) {
      const splitAt = mid + offset;
      if (splitAt <= 0 || splitAt >= len) continue;
      const first = value.slice(0, splitAt);
      const secondRaw = value.slice(splitAt);
      const second = secondRaw.replace(/^\s+/, "");

      if (first !== second) continue;
      if (!/[\s.!?;:,)\]]$/.test(first)) continue;
      value = first;
      collapsed = true;
      break;
    }

    if (!collapsed) break;
  }
  return value;
}

export { appendTextPart, collapseExactDuplicateMessage, MAX_OVERLAP_SCAN_CHARS };
