export type JsonRecord = Record<string, unknown>;

export function toRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

export function toString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function toNumber(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function tryParseJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

export function resolveToolName(rawName: string, toolNameMap?: Map<string, string> | null): string {
  const mapped = toolNameMap?.get(rawName);
  if (typeof mapped === "string" && mapped.trim().length > 0) {
    return mapped;
  }
  if (rawName.startsWith("proxy_") && rawName.length > "proxy_".length) {
    return rawName.slice("proxy_".length);
  }
  return rawName;
}
