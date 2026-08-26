/**
 * Total milliseconds for combined duration strings like "1h30m", "45m",
 * "30s", "1500ms"; null when the value is not a duration string.
 */
export function parseDurationStringToMs(value: string): number | null {
  const match = value.trim().match(/^(?:(\d+)h)?(?:(\d+)m(?!s))?(?:(\d+)s)?(?:(\d+)ms)?$/);
  if (!match) return null;
  const [, h, m, s, ms] = match;
  const total =
    (parseInt(h || "0", 10) * 3600 + parseInt(m || "0", 10) * 60 + parseInt(s || "0", 10)) * 1000 +
    parseInt(ms || "0", 10);
  return total >= 0 ? total : null;
}

/**
 * Heuristic: many providers (incl. Kiro / AWS) send Unix epoch in **seconds**; JS Date expects ms.
 * 9–10 digit values are treated as seconds; 12+ digit values as milliseconds.
 */
function normalizeEpochNumberToMilliseconds(value: number): number {
  if (!Number.isFinite(value) || value === 0) return value;
  const abs = Math.trunc(Math.abs(value));
  const digitCount = String(abs).length;
  if (digitCount <= 10) return value * 1000;
  return value;
}

/**
 * Parse reset date/time to ISO string
 * Handles multiple formats: Unix timestamp (seconds or ms), ISO date string, numeric strings.
 */
export function parseResetTime(resetValue: unknown): string | null {
  if (!resetValue) return null;

  try {
    let date: Date;
    if (resetValue instanceof Date) {
      date = resetValue;
    } else if (typeof resetValue === "number") {
      date = new Date(normalizeEpochNumberToMilliseconds(resetValue));
    } else if (typeof resetValue === "string") {
      const trimmed = resetValue.trim();
      if (/^\d+$/.test(trimmed)) {
        const n = Number(trimmed);
        date = new Date(normalizeEpochNumberToMilliseconds(n));
      } else {
        date = new Date(resetValue);
      }
    } else {
      return null;
    }

    // Epoch-zero (1970-01-01) means no scheduled reset — treat as null
    if (date.getTime() <= 0) return null;

    return date.toISOString();
  } catch {
    return null;
  }
}

/**
 * Parse a rate-limit reset hint into milliseconds from now.
 *
 * Formats accepted:
 *   - Duration strings: "1s", "1m30s", "2h", "500ms"
 *   - Bare numbers: seconds to wait (values in the Unix-epoch-second range,
 *     i.e. > 1700000000, are treated as epoch timestamps instead)
 *   - Absolute dates (ISO strings, epoch numbers/strings) via parseResetTime
 *
 * Returns null when the value cannot be parsed.
 */
export function parseResetDelayMs(resetValue: unknown): number | null {
  if (resetValue === null || resetValue === undefined || resetValue === "") return null;
  const str = String(resetValue).trim();
  if (!str) return null;

  // Duration strings are relative offsets, not timestamps.
  const durationMs = parseDurationStringToMs(str);
  if (durationMs !== null) return durationMs;

  // Pure number: assume seconds to wait, unless it looks like a Unix
  // timestamp (> year 2025), in which case it is an absolute epoch.
  const num = parseFloat(str);
  if (!isNaN(num) && num > 0) {
    if (num > 1700000000) {
      return Math.max(0, num * 1000 - Date.now());
    }
    return num * 1000;
  }

  const iso = parseResetTime(str);
  if (!iso) return null;
  return Math.max(0, new Date(iso).getTime() - Date.now());
}
