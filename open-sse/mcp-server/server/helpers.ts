import type { JsonRecord } from "./types.ts";

export function toRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

export function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function toString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function toStringArray(value: unknown, fallback: string[] = []): string[] {
  const values = toArray(value).filter((entry): entry is string => typeof entry === "string");
  return values.length > 0 ? values : fallback;
}

export function normalizeComboModels(
  rawModels: unknown
): Array<{ provider: string; model: string; priority: number }> {
  return toArray(rawModels).map((rawModel, index) => {
    const model = toRecord(rawModel);
    return {
      provider: toString(model.provider, "unknown"),
      model: toString(model.model, "unknown"),
      priority: toNumber(model.priority, index + 1),
    };
  });
}
