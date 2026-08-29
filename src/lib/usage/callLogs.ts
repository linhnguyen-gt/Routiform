/**
 * Call Logs — extracted from usageDb.js (T-15)
 *
 * Structured call log management: save, query, rotate, and
 * unified single-artifact disk storage for the Logger UI.
 *
 * @module lib/usage/callLogs
 */

import fs from "fs";
import path from "path";
import type { RequestPipelinePayloads } from "@routiform/open-sse/utils/requestLogger.ts";
import { getDbInstance } from "../db/core";
import { getRequestDetailLogByCallLogId } from "../db/detailedLogs";
import { shouldPersistToDisk, CALL_LOGS_DIR } from "./migrations";
import {
  getLoggedInputTokens,
  getLoggedOutputTokens,
  getPromptCacheCreationTokensOrNull,
  getPromptCacheReadTokensOrNull,
  getReasoningTokensOrNull,
  getPromptTokenDetailsOrNull,
  getCompletionTokenDetailsOrNull,
} from "./tokenAccounting";
import { isNoLog } from "../compliance";
import { sanitizePII } from "../piiSanitizer";
import {
  protectPayloadForLog,
  parseStoredPayload,
  serializePayloadForStorage,
} from "../logPayloads";
import { getCallLogMaxEntries, getCallLogRetentionDays } from "../logEnv";
import { getSettings } from "../db/settings";
import { readCallArtifact, writeCallArtifact, type CallLogArtifact } from "./callLogArtifacts";

type JsonRecord = Record<string, unknown>;

type SummaryStorageMode = {
  enabled: boolean;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isArtifactMarker(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record._artifactOnly === true;
}

function normalizePayload(value: unknown): unknown {
  if (isArtifactMarker(value)) return null;
  return value;
}

function hasTruncatedFlag(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (value as Record<string, unknown>)._truncated === true;
}

function sanitizeErrorForLog(error: unknown): unknown {
  if (error === null || error === undefined) return null;
  if (typeof error === "string") return sanitizePII(error).text;
  if (error instanceof Error) {
    return {
      message: sanitizePII(error.message).text,
      stack: sanitizePII(error.stack || "").text || undefined,
      name: error.name,
    };
  }
  return protectPayloadForLog(error);
}

function toStoredErrorString(error: unknown): string | null {
  const sanitized = sanitizeErrorForLog(error);
  if (sanitized === null || sanitized === undefined) return null;
  if (typeof sanitized === "string") return sanitized;
  try {
    return JSON.stringify(sanitized);
  } catch {
    return String(sanitized);
  }
}

function protectPipelinePayloads(payloads: unknown): RequestPipelinePayloads | null {
  if (!payloads || typeof payloads !== "object") return null;

  const protectedPayloads: RequestPipelinePayloads = {};
  for (const [key, value] of Object.entries(payloads as JsonRecord)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (key === "streamChunks" && value && typeof value === "object") {
      const chunks = value as Record<string, unknown>;
      const compacted = Object.fromEntries(
        Object.entries(chunks).filter(
          ([, chunkValue]) => Array.isArray(chunkValue) && chunkValue.length > 0
        )
      );
      if (Object.keys(compacted).length > 0) {
        protectedPayloads.streamChunks = protectPayloadForLog(
          compacted
        ) as RequestPipelinePayloads["streamChunks"];
      }
      continue;
    }

    protectedPayloads[key as keyof RequestPipelinePayloads] = protectPayloadForLog(value) as never;
  }

  return Object.keys(protectedPayloads).length > 0 ? protectedPayloads : null;
}

let logIdCounter = 0;
function generateLogId() {
  logIdCounter++;
  return `${Date.now()}-${logIdCounter}`;
}

async function resolveAccountName(connectionId: string | null | undefined) {
  let account = connectionId ? connectionId.slice(0, 8) : "-";

  if (!connectionId) {
    return account;
  }

  try {
    const { getProviderConnections } = await import("@/lib/localDb");
    const connections = await getProviderConnections();
    const conn = connections.find((item) => item.id === connectionId);
    if (conn) {
      const connName = typeof conn.name === "string" ? conn.name : "";
      const connEmail = typeof conn.email === "string" ? conn.email : "";
      account = connName || connEmail || account;
    }
  } catch {
    // Best-effort lookup only.
  }

  return account;
}

function buildArtifact(
  logEntry: {
    id: string;
    timestamp: string;
    method: string;
    path: string;
    status: number;
    model: string;
    requestedModel: string | null;
    provider: string;
    account: string;
    connectionId: string | null;
    duration: number;
    tokensIn: number;
    tokensOut: number;
    tokensCacheRead: number | null;
    tokensCacheCreation: number | null;
    tokensReasoning: number | null;
    tokensPromptDetails: Record<string, unknown> | null;
    tokensCompletionDetails: Record<string, unknown> | null;
    requestType: string | null;
    sourceFormat: string | null;
    targetFormat: string | null;
    apiKeyId: string | null;
    apiKeyName: string | null;
    comboName: string | null;
  },
  requestBody: unknown,
  responseBody: unknown,
  error: unknown,
  pipelinePayloads: RequestPipelinePayloads | null
): CallLogArtifact {
  return {
    schemaVersion: 3,
    summary: {
      id: logEntry.id,
      timestamp: logEntry.timestamp,
      method: logEntry.method,
      path: logEntry.path,
      status: logEntry.status,
      model: logEntry.model,
      requestedModel: logEntry.requestedModel,
      provider: logEntry.provider,
      account: logEntry.account,
      connectionId: logEntry.connectionId,
      duration: logEntry.duration,
      tokens: {
        in: logEntry.tokensIn,
        out: logEntry.tokensOut,
        cacheRead: logEntry.tokensCacheRead,
        cacheCreation: logEntry.tokensCacheCreation,
        reasoning: logEntry.tokensReasoning,
        promptDetails: logEntry.tokensPromptDetails,
        completionDetails: logEntry.tokensCompletionDetails,
      },
      requestType: logEntry.requestType,
      sourceFormat: logEntry.sourceFormat,
      targetFormat: logEntry.targetFormat,
      apiKeyId: logEntry.apiKeyId,
      apiKeyName: logEntry.apiKeyName,
      comboName: logEntry.comboName,
    },
    requestBody: requestBody ?? null,
    responseBody: responseBody ?? null,
    error: error ?? null,
    ...(pipelinePayloads ? { pipeline: pipelinePayloads as Record<string, unknown> } : {}),
  };
}

function readLegacyLogFromDisk(entry: {
  timestamp: string | null;
  model: string | null;
  status: number;
}) {
  if (!CALL_LOGS_DIR || !entry.timestamp) return null;

  try {
    const date = new Date(entry.timestamp);
    if (Number.isNaN(date.getTime())) return null;

    const dateFolder = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(date.getDate()).padStart(2, "0")}`;
    const dir = path.join(CALL_LOGS_DIR, dateFolder);
    if (!fs.existsSync(dir)) return null;

    const time = `${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(
      2,
      "0"
    )}${String(date.getSeconds()).padStart(2, "0")}`;
    const safeModel = (entry.model || "unknown").replace(/[/:]/g, "-");
    const expectedName = `${time}_${safeModel}_${entry.status}.json`;

    const exactPath = path.join(dir, expectedName);
    if (fs.existsSync(exactPath)) {
      return JSON.parse(fs.readFileSync(exactPath, "utf8"));
    }

    const files = fs
      .readdirSync(dir)
      .filter((file) => file.startsWith(time) && file.endsWith(`_${entry.status}.json`));
    if (files.length > 0) {
      return JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf8"));
    }
  } catch (error) {
    console.error("[callLogs] Failed to read legacy disk log:", (error as Error).message);
  }

  return null;
}

function cleanupEmptyCallLogDirs() {
  if (!CALL_LOGS_DIR || !fs.existsSync(CALL_LOGS_DIR)) return;

  try {
    for (const entry of fs.readdirSync(CALL_LOGS_DIR)) {
      const entryPath = path.join(CALL_LOGS_DIR, entry);
      const stat = fs.statSync(entryPath);
      if (!stat.isDirectory()) continue;
      if (fs.readdirSync(entryPath).length === 0) {
        fs.rmSync(entryPath, { recursive: true, force: true });
      }
    }
  } catch {
    // Best effort only.
  }
}

async function getSummaryStorageMode(): Promise<SummaryStorageMode> {
  try {
    const settings = await getSettings();
    const raw = (settings as Record<string, unknown>).call_log_summary_storage_enabled;
    return { enabled: raw === true || raw === "1" || raw === "true" };
  } catch {
    return { enabled: false };
  }
}

export function cleanupOverflowCallLogFiles(baseDir = CALL_LOGS_DIR, maxEntries?: number) {
  if (!baseDir || !fs.existsSync(baseDir)) return;

  const limit = maxEntries ?? getCallLogMaxEntries();
  if (!Number.isInteger(limit) || limit < 1) return;

  try {
    const files = fs
      .readdirSync(baseDir)
      .flatMap((entry) => {
        const entryPath = path.join(baseDir, entry);
        try {
          const stat = fs.statSync(entryPath);
          if (!stat.isDirectory()) return [];

          return fs
            .readdirSync(entryPath)
            .filter((file) => file.endsWith(".json"))
            .map((file) => {
              const filePath = path.join(entryPath, file);
              const fileStat = fs.statSync(filePath);
              return { filePath, mtimeMs: fileStat.mtimeMs };
            });
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    for (const file of files.slice(limit)) {
      try {
        fs.rmSync(file.filePath, { force: true });
      } catch {
        // Best effort only.
      }
    }

    cleanupEmptyCallLogDirs();
  } catch (error) {
    console.error(
      "[callLogs] Failed to prune overflow request artifacts:",
      (error as Error).message
    );
  }
}

export async function saveCallLog(entry: Record<string, unknown>) {
  if (!shouldPersistToDisk) return;

  try {
    const apiKeyId = String(entry.apiKeyId || "");
    const noLogEnabled = Boolean(entry.noLog) || (apiKeyId ? isNoLog(apiKeyId) : false);

    const protectedRequestBody = noLogEnabled ? null : protectPayloadForLog(entry.requestBody);
    const protectedResponseBody = noLogEnabled ? null : protectPayloadForLog(entry.responseBody);
    const protectedPipelinePayloads = noLogEnabled
      ? null
      : protectPipelinePayloads(entry.pipelinePayloads ?? entry.pipeline ?? null);
    const protectedError = sanitizeErrorForLog(entry.error);

    const account = await resolveAccountName(String(entry.connectionId || ""));

    const logEntry = {
      id: typeof entry.id === "string" && entry.id.length > 0 ? entry.id : generateLogId(),
      timestamp: typeof entry.timestamp === "string" ? entry.timestamp : new Date().toISOString(),
      method: String(entry.method || "POST"),
      path: String(entry.path || "/v1/chat/completions"),
      status: typeof entry.status === "number" ? entry.status : 0,
      model: String(entry.model || "-"),
      requestedModel: String(entry.requestedModel || ""),
      provider: String(entry.provider || "-"),
      account,
      connectionId: String(entry.connectionId || ""),
      duration: typeof entry.duration === "number" ? entry.duration : 0,
      tokensIn: toNumber(getLoggedInputTokens(entry.tokens)),
      tokensOut: toNumber(getLoggedOutputTokens(entry.tokens)),
      tokensCacheRead: getPromptCacheReadTokensOrNull(entry.tokens),
      tokensCacheCreation: getPromptCacheCreationTokensOrNull(entry.tokens),
      tokensReasoning: getReasoningTokensOrNull(entry.tokens),
      tokensPromptDetails: getPromptTokenDetailsOrNull(entry.tokens),
      tokensCompletionDetails: getCompletionTokenDetailsOrNull(entry.tokens),
      requestType: entry.requestType || null,
      sourceFormat: entry.sourceFormat || null,
      targetFormat: entry.targetFormat || null,
      apiKeyId,
      apiKeyName: entry.apiKeyName || null,
      comboName: entry.comboName || null,
      requestBody: serializePayloadForStorage(protectedRequestBody, 8192),
      responseBody: serializePayloadForStorage(protectedResponseBody, 8192),
      error: toStoredErrorString(protectedError),
    };

    const db = getDbInstance();
    const summaryStorageMode = await getSummaryStorageMode();
    const shouldStoreSummaryBodies = !summaryStorageMode.enabled;
    const dbRequestBody = shouldStoreSummaryBodies
      ? logEntry.requestBody
      : JSON.stringify({ _artifactOnly: true, _schemaVersion: 1 });
    const dbResponseBody = shouldStoreSummaryBodies
      ? logEntry.responseBody
      : JSON.stringify({ _artifactOnly: true, _schemaVersion: 1 });
    const dbError = shouldStoreSummaryBodies ? logEntry.error : null;

    db.prepare(
      `
      INSERT INTO call_logs (
        id, timestamp, method, path, status, model, requested_model, provider,
        account, connection_id, duration, tokens_in, tokens_out, request_type, source_format,
        target_format, api_key_id, api_key_name, combo_name, request_body, response_body, error,
        tokens_cache_read, tokens_cache_creation, tokens_reasoning, artifact_relpath,
        has_pipeline_details
      )
      VALUES (
        @id, @timestamp, @method, @path, @status, @model, @requestedModel, @provider,
        @account, @connectionId, @duration, @tokensIn, @tokensOut, @requestType, @sourceFormat,
        @targetFormat, @apiKeyId, @apiKeyName, @comboName, @requestBody, @responseBody, @error,
        @tokensCacheRead, @tokensCacheCreation, @tokensReasoning, NULL, 0
      )
    `
    ).run({
      ...logEntry,
      requestBody: dbRequestBody,
      responseBody: dbResponseBody,
      error: dbError,
    });

    if (!noLogEnabled) {
      const { requestBody: _rb, responseBody: _respb, error: _err, ...artifactEntry } = logEntry;
      const artifact = buildArtifact(
        artifactEntry as Parameters<typeof buildArtifact>[0],
        protectedRequestBody,
        protectedResponseBody,
        protectedError,
        protectedPipelinePayloads
      );
      const artifactRelPath = writeCallArtifact(artifact, () => rotateCallLogs());

      if (artifactRelPath) {
        db.prepare(
          `
          UPDATE call_logs
          SET artifact_relpath = ?, has_pipeline_details = ?
          WHERE id = ?
        `
        ).run(artifactRelPath, protectedPipelinePayloads ? 1 : 0, logEntry.id);
      }
    }

    const overflow = db
      .prepare("SELECT COUNT(*) - ? AS overflow FROM call_logs")
      .get(getCallLogMaxEntries()) as { overflow?: number };
    const overflowRows = Math.max(0, overflow?.overflow ?? 0);
    if (overflowRows > 0) {
      // Get the IDs that will be deleted from call_logs first
      const evictedIds = db
        .prepare(
          `SELECT id FROM call_logs
           ORDER BY timestamp ASC, id ASC
           LIMIT ?`
        )
        .all(overflowRows) as { id: string }[];

      const idsToDelete = evictedIds.map((row) => row.id);
      if (idsToDelete.length > 0) {
        // First delete from request_detail_logs (the child table with foreign key reference to call_log_id)
        const placeholders = idsToDelete.map(() => "?").join(",");
        db.prepare(`DELETE FROM request_detail_logs WHERE call_log_id IN (${placeholders})`).run(
          ...idsToDelete
        );

        // Then delete from call_logs
        db.prepare(`DELETE FROM call_logs WHERE id IN (${placeholders})`).run(...idsToDelete);
      }
    }
  } catch (error) {
    console.error("[callLogs] Failed to save call log:", (error as Error).message);
  }
}

export function rotateCallLogs() {
  if (!CALL_LOGS_DIR || !fs.existsSync(CALL_LOGS_DIR)) return;

  try {
    const entries = fs.readdirSync(CALL_LOGS_DIR);
    const now = Date.now();
    const retentionMs = getCallLogRetentionDays() * 24 * 60 * 60 * 1000;

    for (const entry of entries) {
      const entryPath = path.join(CALL_LOGS_DIR, entry);
      const stat = fs.statSync(entryPath);
      if (stat.isDirectory() && now - stat.mtimeMs > retentionMs) {
        fs.rmSync(entryPath, { recursive: true, force: true });
      }
    }
    cleanupOverflowCallLogFiles(CALL_LOGS_DIR, getCallLogMaxEntries());
  } catch (error) {
    console.error("[callLogs] Failed to rotate request artifacts:", (error as Error).message);
  }
}

if (shouldPersistToDisk) {
  try {
    rotateCallLogs();
  } catch {
    // Best-effort startup cleanup.
  }
}

export async function getCallLogs(filter: Record<string, unknown> = {}) {
  const db = getDbInstance();
  let sql = "SELECT * FROM call_logs";
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (!filter.includeInternal) {
    conditions.push(
      "(request_type IS NULL OR request_type NOT IN (@exclModelSync, @exclConnectionTest))"
    );
    params.exclModelSync = "model-sync";
    params.exclConnectionTest = "connection-test";
  }

  if (filter.status) {
    if (filter.status === "error") {
      conditions.push("(status >= 400 OR error IS NOT NULL)");
    } else if (filter.status === "ok") {
      conditions.push("status >= 200 AND status < 300");
    } else {
      const statusCode = parseInt(String(filter.status), 10);
      if (!Number.isNaN(statusCode)) {
        conditions.push("status = @statusCode");
        params.statusCode = statusCode;
      }
    }
  }

  if (filter.model) {
    conditions.push("(model LIKE @modelQ OR requested_model LIKE @modelQ)");
    params.modelQ = `%${filter.model}%`;
  }
  if (filter.provider) {
    conditions.push("provider LIKE @providerQ");
    params.providerQ = `%${filter.provider}%`;
  }
  if (filter.account) {
    conditions.push("account LIKE @accountQ");
    params.accountQ = `%${filter.account}%`;
  }
  if (filter.apiKey) {
    conditions.push("(api_key_name LIKE @apiKeyQ OR api_key_id LIKE @apiKeyQ)");
    params.apiKeyQ = `%${filter.apiKey}%`;
  }
  if (filter.combo) {
    conditions.push("combo_name IS NOT NULL");
  }
  if (filter.search) {
    conditions.push(`(
      model LIKE @searchQ OR path LIKE @searchQ OR account LIKE @searchQ OR
      requested_model LIKE @searchQ OR provider LIKE @searchQ OR
      api_key_name LIKE @searchQ OR api_key_id LIKE @searchQ OR
      combo_name LIKE @searchQ OR CAST(status AS TEXT) LIKE @searchQ
    )`);
    params.searchQ = `%${filter.search}%`;
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  const limit = filter.limit || 200;
  sql += ` ORDER BY timestamp DESC LIMIT ${limit}`;

  const rows = db.prepare(sql).all(params);

  return rows.map((row) => {
    const l = asRecord(row);
    return {
      id: toStringOrNull(l.id),
      timestamp: toStringOrNull(l.timestamp),
      method: toStringOrNull(l.method),
      path: toStringOrNull(l.path),
      status: toNumber(l.status),
      model: toStringOrNull(l.model),
      requestedModel: toStringOrNull(l.requested_model),
      provider: toStringOrNull(l.provider),
      account: toStringOrNull(l.account),
      duration: toNumber(l.duration),
      tokens: {
        in: toNumber(l.tokens_in),
        out: toNumber(l.tokens_out),
        cacheRead: l.tokens_cache_read === null ? null : toNumber(l.tokens_cache_read),
        cacheCreation: l.tokens_cache_creation === null ? null : toNumber(l.tokens_cache_creation),
        reasoning: l.tokens_reasoning === null ? null : toNumber(l.tokens_reasoning),
        promptDetails: null, // Only available from JSON artifact, not DB row
        completionDetails: null, // Only available from JSON artifact, not DB row
      },
      sourceFormat: toStringOrNull(l.source_format),
      targetFormat: toStringOrNull(l.target_format),
      error: toStringOrNull(l.error),
      comboName: toStringOrNull(l.combo_name),
      apiKeyId: toStringOrNull(l.api_key_id),
      apiKeyName: toStringOrNull(l.api_key_name),
      hasRequestBody:
        typeof l.request_body === "string" &&
        l.request_body.length > 0 &&
        !String(l.request_body).includes('"_artifactOnly":true'),
      hasResponseBody:
        typeof l.response_body === "string" &&
        l.response_body.length > 0 &&
        !String(l.response_body).includes('"_artifactOnly":true'),
      hasPipelineDetails: toNumber(l.has_pipeline_details) === 1,
    };
  });
}

function buildLegacyPipelinePayloads(id: string) {
  const detailed = getRequestDetailLogByCallLogId(id);
  if (!detailed) return null;

  return {
    clientRequest: detailed.client_request ?? null,
    providerRequest: detailed.translated_request ?? null,
    providerResponse: detailed.provider_response ?? null,
    clientResponse: detailed.client_response ?? null,
  };
}

export async function getCallLogById(id: string) {
  const db = getDbInstance();
  const row = db.prepare("SELECT * FROM call_logs WHERE id = ?").get(id);
  if (!row) return null;

  const entryRow = asRecord(row);
  const artifactRelPath = toStringOrNull(entryRow.artifact_relpath);
  const entry = {
    id: toStringOrNull(entryRow.id),
    timestamp: toStringOrNull(entryRow.timestamp),
    method: toStringOrNull(entryRow.method),
    path: toStringOrNull(entryRow.path),
    status: toNumber(entryRow.status),
    model: toStringOrNull(entryRow.model),
    requestedModel: toStringOrNull(entryRow.requested_model),
    provider: toStringOrNull(entryRow.provider),
    account: toStringOrNull(entryRow.account),
    connectionId: toStringOrNull(entryRow.connection_id),
    duration: toNumber(entryRow.duration),
    tokens: {
      in: toNumber(entryRow.tokens_in),
      out: toNumber(entryRow.tokens_out),
      cacheRead: entryRow.tokens_cache_read === null ? null : toNumber(entryRow.tokens_cache_read),
      cacheCreation:
        entryRow.tokens_cache_creation === null ? null : toNumber(entryRow.tokens_cache_creation),
      reasoning: entryRow.tokens_reasoning === null ? null : toNumber(entryRow.tokens_reasoning),
      promptDetails: null, // Read from JSON artifact later
      completionDetails: null, // Read from JSON artifact later
    },
    sourceFormat: toStringOrNull(entryRow.source_format),
    targetFormat: toStringOrNull(entryRow.target_format),
    apiKeyId: toStringOrNull(entryRow.api_key_id),
    apiKeyName: toStringOrNull(entryRow.api_key_name),
    comboName: toStringOrNull(entryRow.combo_name),
    requestBody: normalizePayload(parseStoredPayload(entryRow.request_body)),
    responseBody: normalizePayload(parseStoredPayload(entryRow.response_body)),
    error: toStringOrNull(entryRow.error),
    artifactRelPath,
    hasPipelineDetails: toNumber(entryRow.has_pipeline_details) === 1,
  };

  const artifact = readCallArtifact(artifactRelPath);
  if (artifact) {
    // Merge tokens to retain detail from artifact
    const artifactTokens = artifact.summary?.tokens || {};
    return {
      ...entry,
      tokens: {
        ...entry.tokens,
        cacheRead:
          entry.tokens.cacheRead ??
          ((artifactTokens as Record<string, unknown>).cacheRead as number | null) ??
          null,
        cacheCreation:
          entry.tokens.cacheCreation ??
          ((artifactTokens as Record<string, unknown>).cacheCreation as number | null) ??
          null,
        reasoning:
          entry.tokens.reasoning ??
          ((artifactTokens as Record<string, unknown>).reasoning as number | null) ??
          null,
        promptDetails: (artifactTokens as Record<string, unknown>).promptDetails ?? null,
        completionDetails: (artifactTokens as Record<string, unknown>).completionDetails ?? null,
      },
      requestBody: artifact.requestBody ?? entry.requestBody,
      responseBody: artifact.responseBody ?? entry.responseBody,
      error: artifact.error ?? entry.error,
      pipelinePayloads: artifact.pipeline ?? null,
      hasPipelineDetails: Boolean(artifact.pipeline) || entry.hasPipelineDetails,
    };
  }

  const needsLegacyDisk =
    hasTruncatedFlag(entry.requestBody) || hasTruncatedFlag(entry.responseBody) || !artifactRelPath;
  if (needsLegacyDisk) {
    const legacyEntry = readLegacyLogFromDisk(entry);
    if (legacyEntry) {
      const legacyPipeline = buildLegacyPipelinePayloads(id);
      return {
        ...entry,
        requestBody: legacyEntry.requestBody ?? entry.requestBody,
        responseBody: legacyEntry.responseBody ?? entry.responseBody,
        error: legacyEntry.error ?? entry.error,
        pipelinePayloads: legacyPipeline,
        hasPipelineDetails: Boolean(legacyPipeline),
      };
    }
  }

  const legacyPipeline = buildLegacyPipelinePayloads(id);
  if (legacyPipeline) {
    return {
      ...entry,
      pipelinePayloads: legacyPipeline,
      hasPipelineDetails: true,
    };
  }

  return entry;
}
