/**
 * db/combos.js — Combo CRUD operations.
 */

import { v4 as uuidv4 } from "uuid";
import { getDbInstance } from "./core";
import { backupDbFile } from "./backup";
import {
  DEFAULT_COMBO_CONTEXT_LENGTH,
  DEFAULT_COMBO_MAX_OUTPUT_TOKENS,
} from "../../shared/constants/combo-defaults";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function getSerializedData(value: unknown): string | null {
  const row = asRecord(value);
  return typeof row.data === "string" ? row.data : null;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && value > 0;
}

/**
 * Fill in the token limits a stored combo does not carry.
 *
 * Applied on read rather than written back: a combo that never chose a limit has no stored
 * value to migrate, and persisting one would invent state. The consequence is that changing
 * the constants moves every combo that left the field blank — which is the intent.
 */
function normalizeComboTokenLimits(combo: JsonRecord): JsonRecord {
  const normalized = { ...combo };
  if (!isPositiveNumber(normalized.context_length)) {
    normalized.context_length = DEFAULT_COMBO_CONTEXT_LENGTH;
  }
  if (!isPositiveNumber(normalized.max_output_tokens)) {
    normalized.max_output_tokens = DEFAULT_COMBO_MAX_OUTPUT_TOKENS;
  }
  return normalized;
}

export async function getCombos() {
  const db = getDbInstance();
  return db
    .prepare("SELECT data FROM combos ORDER BY sort_order ASC, name ASC")
    .all()
    .map((row) => getSerializedData(row))
    .filter((row): row is string => row !== null)
    .map((row) => normalizeComboTokenLimits(JSON.parse(row)));
}

/**
 * Reorder combos by assigning sequential sort_order values.
 * Runs in a transaction to ensure atomicity.
 *
 * @param orderedIds - Array of combo IDs in desired display order
 * @returns number of rows updated
 */
export async function reorderCombos(orderedIds: string[]): Promise<number> {
  const db = getDbInstance();

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const orderedUniqueIds = orderedIds.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  // Return early if empty to avoid invalid SQL WHERE id IN ()
  if (orderedUniqueIds.length === 0) return 0;

  // Validate all IDs exist before updating
  const placeholders = orderedUniqueIds.map(() => "?").join(",");
  const existing = db
    .prepare(`SELECT id FROM combos WHERE id IN (${placeholders})`)
    .all(...orderedUniqueIds)
    .map((row: Record<string, unknown>) => row.id);

  const validIds = orderedUniqueIds.filter((id) => existing.includes(id));
  if (validIds.length === 0) return 0;

  const stmt = db.prepare("UPDATE combos SET sort_order = ? WHERE id = ?");
  let updated = 0;

  const run = db.transaction(() => {
    for (let i = 0; i < validIds.length; i++) {
      const result = stmt.run(i + 1, validIds[i]);
      updated += result.changes;
    }
  });

  run();
  backupDbFile("pre-write");
  return updated;
}

export async function getComboById(id: string) {
  const db = getDbInstance();
  const row = db.prepare("SELECT data FROM combos WHERE id = ?").get(id);
  const payload = getSerializedData(row);
  return payload ? normalizeComboTokenLimits(JSON.parse(payload)) : null;
}

export async function getComboByName(name: string) {
  const db = getDbInstance();
  const row = db.prepare("SELECT data FROM combos WHERE name = ?").get(name);
  const payload = getSerializedData(row);
  return payload ? normalizeComboTokenLimits(JSON.parse(payload)) : null;
}

export async function createCombo(data: JsonRecord) {
  const db = getDbInstance();
  const now = new Date().toISOString();

  const combo: JsonRecord = {
    id: uuidv4(),
    name: data.name,
    models: data.models || [],
    strategy: data.strategy || "priority",
    config: data.config || {},
    isHidden: Boolean(data.isHidden),
    createdAt: now,
    updatedAt: now,
    context_length: isPositiveNumber(data.context_length)
      ? data.context_length
      : DEFAULT_COMBO_CONTEXT_LENGTH,
    max_output_tokens: isPositiveNumber(data.max_output_tokens)
      ? data.max_output_tokens
      : DEFAULT_COMBO_MAX_OUTPUT_TOKENS,
  };

  const optionalComboKeys = [
    "requireToolCalling",
    "system_message",
    "tool_filter_regex",
    "context_cache_protection",
    "context_length",
    "max_output_tokens",
    "allowedProviders",
  ];
  for (const k of optionalComboKeys) {
    if (data[k] !== undefined) combo[k] = data[k];
  }

  db.prepare(
    "INSERT INTO combos (id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(combo.id, combo.name, JSON.stringify(combo), now, now);

  backupDbFile("pre-write");
  return combo;
}

export async function updateCombo(id: string, data: JsonRecord) {
  const db = getDbInstance();
  const existing = db.prepare("SELECT data FROM combos WHERE id = ?").get(id);
  if (!existing) return null;

  const serializedCurrent = getSerializedData(existing);
  if (!serializedCurrent) return null;
  const current = JSON.parse(serializedCurrent);
  const merged = { ...current, ...data, updatedAt: new Date().toISOString() };

  db.prepare("UPDATE combos SET name = ?, data = ?, updated_at = ? WHERE id = ?").run(
    merged.name,
    JSON.stringify(merged),
    merged.updatedAt,
    id
  );

  backupDbFile("pre-write");
  return merged;
}

export async function deleteCombo(id: string) {
  const db = getDbInstance();
  const result = db.prepare("DELETE FROM combos WHERE id = ?").run(id);
  if (result.changes === 0) return false;
  backupDbFile("pre-write");
  return true;
}
