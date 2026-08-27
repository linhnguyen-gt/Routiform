function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function normalizeClaudeCitations(value) {
  if (Array.isArray(value)) return cloneJson(value);
  if (value && typeof value === "object") return [cloneJson(value)];
  return undefined;
}

export { toRecord, toString, toNumber, cloneJson, normalizeClaudeCitations };
