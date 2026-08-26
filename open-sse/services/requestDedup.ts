/**
 * Request Deduplication Service
 *
 * Deduplicates **concurrent** identical requests to the same upstream so that
 * misbehaving clients (or buggy gateways like OpenClaw issue #10377) cannot
 * cause double token spend on the proxy.
 *
 * Modes:
 *   - "off"     — disabled, every request goes upstream.
 *   - "shadow"  — detect duplicates and log, but DO NOT share promises.
 *                 Use for observability rollout.
 *   - "enforce" — duplicate concurrent requests share one upstream call via
 *                 promise sharing; second reader receives `Response.clone()`.
 *
 * IMPORTANT: In-memory only — does NOT persist across restarts and does NOT
 * work across multiple process instances.
 *
 * Generic, no client-specific gating. Side-effecting requests (tool follow-up
 * loop) are skipped automatically; per-request bypass headers are honored.
 */

import { createHash } from "node:crypto";

export type DedupMode = "off" | "shadow" | "enforce";

export interface DedupConfig {
  /** Hard kill switch — kept for backwards compatibility. */
  enabled: boolean;
  /** Operating mode; takes precedence over `enabled` once explicitly set. */
  mode: DedupMode;
  /** Requests with sampling temperature above this skip dedupe. */
  maxTemperatureForDedup: number;
  /** Inflight registry TTL in ms. */
  ttlMs: number;
  /** Hard ceiling on per-call ttlMs override. */
  maxTtlMs: number;
  /** Legacy field kept so callers passing `timeoutMs` still type-check. */
  timeoutMs: number;
}

const DEFAULT_TTL_MS = 2_000;
const DEFAULT_MAX_TTL_MS = 5_000;

function readEnvMode(): DedupMode {
  const raw = (
    typeof process !== "undefined" ? process.env?.ROUTIFORM_DEDUPE_MODE : undefined
  )?.toLowerCase();
  if (raw === "off" || raw === "shadow" || raw === "enforce") return raw;
  return "enforce"; // Phase 2 default — block duplicates before token spend.
}

export const DEFAULT_DEDUP_CONFIG: DedupConfig = {
  enabled: true,
  mode: readEnvMode(),
  maxTemperatureForDedup: 1.0,
  ttlMs: DEFAULT_TTL_MS,
  maxTtlMs: DEFAULT_MAX_TTL_MS,
  // Legacy alias preserved so any older caller still compiles. We do not use it.
  timeoutMs: 60_000,
};

/** Mutable runtime config; UI/global settings layer can update at runtime. */
let runtimeConfig: DedupConfig = { ...DEFAULT_DEDUP_CONFIG };

export function getDedupConfig(): DedupConfig {
  return { ...runtimeConfig };
}

export function setDedupConfig(patch: Partial<DedupConfig>): void {
  runtimeConfig = { ...runtimeConfig, ...patch };
}

// ─── Counters (lightweight observability — surfaced via getDedupCounters) ────

interface DedupCounters {
  shadowWouldHaveBlocked: number;
  inflightHits: number;
  bypassReasons: Record<string, number>;
  idempotencyKeyHits: number;
  cloneFailures: number;
  /** Adjacent duplicate user/tool messages collapsed by dedupeConsecutiveMessages. */
  messageCollapsed: number;
  /** Requests where consecutive duplicates were observed (regardless of mode). */
  messageCollapseRequests: number;
}

const counters: DedupCounters = {
  shadowWouldHaveBlocked: 0,
  inflightHits: 0,
  bypassReasons: {},
  idempotencyKeyHits: 0,
  cloneFailures: 0,
  messageCollapsed: 0,
  messageCollapseRequests: 0,
};

export function getDedupCounters(): DedupCounters {
  return {
    ...counters,
    bypassReasons: { ...counters.bypassReasons },
  };
}

export function resetDedupCounters(): void {
  counters.shadowWouldHaveBlocked = 0;
  counters.inflightHits = 0;
  counters.bypassReasons = {};
  counters.idempotencyKeyHits = 0;
  counters.cloneFailures = 0;
  counters.messageCollapsed = 0;
  counters.messageCollapseRequests = 0;
}

/** Recorded when normalize step collapses adjacent duplicate messages. */
export function recordMessageDedupe(removedCount: number): void {
  if (removedCount <= 0) return;
  counters.messageCollapsed += removedCount;
  counters.messageCollapseRequests += 1;
}

function bumpBypass(reason: string): void {
  counters.bypassReasons[reason] = (counters.bypassReasons[reason] || 0) + 1;
}

// ─── Hashing & body classification ───────────────────────────────────────────

export interface DedupResult<T> {
  result: T;
  wasDeduplicated: boolean;
  hash: string;
}

interface InflightEntry<T = unknown> {
  promise: Promise<T>;
  createdAt: number;
}

const inflight = new Map<string, InflightEntry>();

/**
 * Fields that never change what the model produces, so two requests differing
 * only in these are still duplicates. Dropped at the top level ONLY: the same
 * names carry real meaning further down — `user` is a legitimate tool-schema
 * property and `metadata` appears inside a tool result.
 */
const COSMETIC_ROOT_KEYS = ["user", "metadata", "stream_options", "request_id", "requestId"];

/**
 * Per-request nonces the format translators mint on the way out: the Gemini
 * envelope gets `request.sessionId` from `Math.random()`, CommandCode gets a
 * `threadId` UUID. They are already gone from the response, so they cannot mean
 * anything to the model — but left in the fingerprint they make every request
 * unique, which silently turns dedupe off for exactly those providers.
 */
const NONCE_KEYS = ["sessionId", "session_id", "threadId", "thread_id"];

function withoutKeys(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const copy = { ...source };
  for (const key of keys) delete copy[key];
  return copy;
}

/**
 * Serialise with sorted keys so two bodies that carry the same data in a
 * different property order fingerprint identically.
 *
 * Anything that is not a plain object or array falls through to `JSON.stringify`,
 * so a `Map` or a class instance serialises as `{}`. The only such value in a
 * translated body is a tool-name lookup whose contents are also in `request.tools`,
 * so nothing that shapes the answer is lost.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Gemini keeps sampling temperature in the envelope, not at the body root. */
export function readTemperature(body: Record<string, unknown>): number {
  if (typeof body.temperature === "number") return body.temperature;
  const generationConfig = (body.request as Record<string, unknown> | undefined)
    ?.generationConfig as Record<string, unknown> | undefined;
  if (typeof generationConfig?.temperature === "number") return generationConfig.temperature;
  return 1.0;
}

/**
 * Compute a deterministic hash for a request body.
 *
 * The body reaching this point is already in the **upstream provider's** format,
 * which is not always OpenAI's. An earlier version listed OpenAI field names
 * explicitly and so read nothing at all out of a Gemini/Cloud Code envelope
 * (`request.contents`, `request.systemInstruction`) or a Claude `system` block:
 * every antigravity request on a given model produced the same fingerprint, and
 * two concurrent ones shared a single upstream call — the second caller received
 * the first one's answer.
 *
 * Hashing the whole body instead is format-agnostic. Apart from the two small
 * lists above, an unrecognised field can now only make two requests look
 * *different*, which costs a missed dedupe; it can never make two different
 * requests look the same.
 */
export function computeRequestHash(requestBody: unknown): string {
  const body = (requestBody ?? {}) as Record<string, unknown>;
  const canonical = withoutKeys(body, [...COSMETIC_ROOT_KEYS, ...NONCE_KEYS]);

  const envelope = canonical.request;
  if (envelope && typeof envelope === "object" && !Array.isArray(envelope)) {
    canonical.request = withoutKeys(envelope as Record<string, unknown>, NONCE_KEYS);
  }

  // Normalised because the provider default and an explicit value mean the same
  // request, and because `stream` must stay inside the fingerprint: the stream
  // and non-stream variants of one request have different response shapes.
  canonical.temperature = readTemperature(body);
  canonical.stream = body.stream ?? false;

  return createHash("sha256").update(stableStringify(canonical)).digest("hex").slice(0, 16);
}

/** A Gemini tool result is a `functionResponse` part rather than a `tool` role. */
function hasGeminiToolResult(contents: unknown): boolean {
  if (!Array.isArray(contents) || contents.length === 0) return false;
  const last = contents[contents.length - 1] as { parts?: Array<Record<string, unknown>> };
  return (last?.parts ?? []).some((part) => part && "functionResponse" in part);
}

/**
 * Heuristic: requests whose last message is a tool result are part of the
 * tool follow-up loop. Replaying the same payload is semantically a NEW turn
 * and must reach the upstream — never dedupe.
 */
export function detectSideEffect(body: unknown): boolean {
  const b = (body ?? {}) as Record<string, unknown>;
  const messages = b.messages as Array<{ role?: string }> | undefined;
  if (Array.isArray(messages) && messages.length > 0) {
    const last = messages[messages.length - 1];
    if (last?.role === "tool") return true;
  }
  const request = b.request as Record<string, unknown> | undefined;
  return hasGeminiToolResult(b.contents ?? request?.contents);
}

export interface DedupHeaderControls {
  bypass: boolean;
  bypassReason: string | null;
  idempotencyKey: string | null;
  ttlMsOverride: number | null;
}

/** Read header overrides from a Headers object or plain record. */
export function readDedupeControls(
  headers: Headers | Record<string, string | string[] | undefined> | null | undefined
): DedupHeaderControls {
  const get = (name: string): string | null => {
    if (!headers) return null;
    if (typeof (headers as Headers).get === "function") {
      return (headers as Headers).get(name) ?? (headers as Headers).get(name.toLowerCase());
    }
    const map = headers as Record<string, string | string[] | undefined>;
    const direct = map[name] ?? map[name.toLowerCase()];
    if (Array.isArray(direct)) return typeof direct[0] === "string" ? direct[0] : null;
    return typeof direct === "string" ? direct : null;
  };

  const bypassHeader = get("x-routiform-no-dedupe");
  const cacheControl = get("cache-control");
  const idem = get("idempotency-key");
  const ttlRaw = get("x-routiform-dedupe-ttl");

  let bypass = false;
  let bypassReason: string | null = null;
  if (bypassHeader === "1" || bypassHeader === "true") {
    bypass = true;
    bypassReason = "header";
  } else if (cacheControl && /no-store/i.test(cacheControl)) {
    bypass = true;
    bypassReason = "cache-control";
  }

  const ttlOverride = ttlRaw ? Number.parseInt(ttlRaw, 10) : NaN;
  return {
    bypass,
    bypassReason,
    idempotencyKey: idem && idem.trim().length > 0 ? idem.trim() : null,
    ttlMsOverride: Number.isFinite(ttlOverride) ? ttlOverride : null,
  };
}

/**
 * Determine whether a request is dedupe-eligible based on body shape alone
 * (no header / inflight knowledge).
 *
 * Streaming requests are excluded entirely: sharing one upstream stream across
 * clients couples their lifecycles (client A's disconnect aborts client B),
 * double-bills via two onComplete paths, and forces unbounded tee buffering.
 */
export function shouldDeduplicate(
  requestBody: unknown,
  config: DedupConfig = runtimeConfig
): boolean {
  if (!config.enabled || config.mode === "off") return false;
  const body = (requestBody ?? {}) as Record<string, unknown>;
  if (body.stream === true) return false;
  // Read through the provider envelope too, or a high-temperature Gemini request
  // looks like an unset default and two concurrent ones would share one sample.
  if (readTemperature(body) > config.maxTemperatureForDedup) return false;
  return true;
}

// ─── Inflight dedupe core ────────────────────────────────────────────────────

export interface InflightDedupeOptions {
  /** Override the shared TTL for this call. Clamped to maxTtlMs. */
  ttlMs?: number;
  /** Pre-supplied fingerprint key, e.g. derived from Idempotency-Key. */
  keyOverride?: string | null;
  /** Bypass dedupe entirely for this call (header / side-effect / temp). */
  bypass?: boolean;
  bypassReason?: string | null;
  log?: { info?: (t: string, m: string) => void; debug?: (t: string, m: string) => void } | null;
  /** Optional config snapshot for testability. Defaults to runtimeConfig. */
  config?: DedupConfig;
}

interface InflightDedupeReturn<T> {
  result: T;
  wasDeduplicated: boolean;
  hash: string;
  mode: DedupMode;
  bypassed: boolean;
  bypassReason: string | null;
}

function pickHash(body: unknown, opts: InflightDedupeOptions): string {
  if (opts.keyOverride && opts.keyOverride.trim().length > 0) {
    return `idem:${opts.keyOverride.trim()}`;
  }
  return computeRequestHash(body);
}

/**
 * Hand each shared-inflight caller its own readable copy of the result.
 *
 * Two cases must be supported because the proxy uses both shapes:
 *  1) Top-level Response  — clone() directly.
 *  2) Wrapper object containing a Response under a known field name (`response`)
 *     — clone the nested Response and rebuild the wrapper. This is the shape
 *     returned by chat-core's `execute()`: `{ response, url, headers, ... }`.
 *     Sharing the same wrapper would make caller #2 see an already-consumed
 *     body and crash in `chatCorePhaseNonStreamParse`.
 *
 * Returns `{ok:false}` to signal the caller should fall back to a fresh
 * upstream call (we never want a half-cloned wrapper to leak through).
 */
function cloneSharedResult(
  value: unknown,
  log?: InflightDedupeOptions["log"]
): { ok: true; value: unknown } | { ok: false; reason: string } {
  if (typeof Response !== "undefined" && value instanceof Response) {
    try {
      return { ok: true, value: value.clone() };
    } catch (e) {
      return { ok: false, reason: (e as Error).message || "response-clone-failed" };
    }
  }

  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "response" in value &&
    typeof Response !== "undefined" &&
    (value as { response?: unknown }).response instanceof Response
  ) {
    try {
      const wrapper = value as Record<string, unknown> & { response: Response };
      const clonedResponse = wrapper.response.clone();
      return { ok: true, value: { ...wrapper, response: clonedResponse } };
    } catch (e) {
      return { ok: false, reason: (e as Error).message || "wrapper-clone-failed" };
    }
  }

  // Plain JSON-serializable value (no Response inside) — safe to share by reference.
  log?.debug?.("DEDUP", "Sharing plain value by reference (no Response detected)");
  return { ok: true, value };
}

/**
 * Execute a request with inflight dedupe, honoring shadow vs enforce mode.
 *
 * - In SHADOW mode: still calls upstream, but logs a counter when a duplicate
 *   inflight is detected, so operators can size the impact before enforcing.
 * - In ENFORCE mode: second concurrent caller awaits the first call's promise
 *   and returns `Response.clone()` if T is a Response (or the same value
 *   otherwise). If clone fails, falls back to a fresh upstream call.
 */
export async function withInflightDedupe<T>(
  body: unknown,
  fn: () => Promise<T>,
  opts: InflightDedupeOptions = {}
): Promise<InflightDedupeReturn<T>> {
  const cfg = opts.config ?? runtimeConfig;
  const hash = pickHash(body, opts);

  if (!cfg.enabled || cfg.mode === "off") {
    return {
      result: await fn(),
      wasDeduplicated: false,
      hash,
      mode: cfg.mode,
      bypassed: true,
      bypassReason: "mode-off",
    };
  }

  if (opts.bypass) {
    if (opts.bypassReason) bumpBypass(opts.bypassReason);
    return {
      result: await fn(),
      wasDeduplicated: false,
      hash,
      mode: cfg.mode,
      bypassed: true,
      bypassReason: opts.bypassReason ?? "bypass",
    };
  }

  if (opts.keyOverride) counters.idempotencyKeyHits++;

  const ttl = Math.min(opts.ttlMs ?? cfg.ttlMs, cfg.maxTtlMs);
  const now = Date.now();
  const existing = inflight.get(hash);
  const isFresh = existing && now - existing.createdAt < ttl;

  if (existing && isFresh) {
    if (cfg.mode === "shadow") {
      counters.shadowWouldHaveBlocked++;
      opts.log?.info?.(
        "DEDUP-SHADOW",
        `would have shared inflight hash=${hash} age=${now - existing.createdAt}ms`
      );
      // shadow does NOT short-circuit — still run upstream
      return {
        result: await fn(),
        wasDeduplicated: false,
        hash,
        mode: cfg.mode,
        bypassed: false,
        bypassReason: null,
      };
    }
    // enforce
    counters.inflightHits++;
    opts.log?.info?.(
      "DEDUP-HIT",
      `sharing inflight hash=${hash} age=${now - existing.createdAt}ms`
    );
    try {
      const shared = (await existing.promise) as T;
      const cloned = cloneSharedResult(shared, opts.log);
      if (cloned.ok) {
        return {
          result: cloned.value as T,
          wasDeduplicated: true,
          hash,
          mode: cfg.mode,
          bypassed: false,
          bypassReason: null,
        };
      }
      // cloned.ok === false here — narrow explicitly so .reason is typed.
      const failure = cloned as { ok: false; reason: string };
      counters.cloneFailures++;
      opts.log?.info?.(
        "DEDUP",
        `Clone of shared result failed (${failure.reason}); falling back to fresh upstream`
      );
      // Fall through to fresh exec below.
    } catch {
      // Original promise rejected — fall through to a fresh attempt for this caller.
    }
  }

  // Either no inflight, expired entry, or clone fallback path.
  const promise = fn();
  inflight.set(hash, { promise: promise as Promise<unknown>, createdAt: now });

  // Schedule cleanup. The TTL is also a hint for "how long another caller may
  // join the same inflight", not a hard timeout on the upstream call itself.
  const cleanup = () => {
    const cur = inflight.get(hash);
    if (cur && cur.promise === (promise as Promise<unknown>)) {
      inflight.delete(hash);
    }
  };

  promise
    .then(() => {
      // Keep the entry around for `ttl` so a near-immediate duplicate hits the
      // shared promise even if the upstream finished extremely fast.
      setTimeout(cleanup, ttl).unref?.();
    })
    .catch(() => {
      // On error, evict immediately — never glue duplicates onto a failure.
      cleanup();
    });

  try {
    const result = await promise;
    return {
      result,
      wasDeduplicated: false,
      hash,
      mode: cfg.mode,
      bypassed: false,
      bypassReason: null,
    };
  } catch (err) {
    throw err;
  }
}

// ─── Legacy API kept for backwards compatibility ─────────────────────────────
//
// `deduplicate(hash, fn, config)` is preserved with its old contract (it always
// shares the inflight promise — equivalent to enforce mode on a single hash).
// New call sites should prefer `withInflightDedupe`.

export async function deduplicate<T>(
  hash: string,
  fn: () => Promise<T>,
  config: DedupConfig = runtimeConfig
): Promise<DedupResult<T>> {
  if (!config.enabled || config.mode === "off") {
    return { result: await fn(), wasDeduplicated: false, hash };
  }

  const existing = inflight.get(hash);
  if (existing) {
    const result = (await existing.promise) as T;
    return { result, wasDeduplicated: true, hash };
  }

  const promise = fn();
  inflight.set(hash, { promise: promise as Promise<unknown>, createdAt: Date.now() });

  const ttl = Math.min(config.ttlMs ?? DEFAULT_TTL_MS, config.maxTtlMs ?? DEFAULT_MAX_TTL_MS);
  const cleanup = () => {
    const cur = inflight.get(hash);
    if (cur && cur.promise === (promise as Promise<unknown>)) inflight.delete(hash);
  };
  promise
    .then(() => {
      setTimeout(cleanup, ttl).unref?.();
    })
    .catch(() => cleanup());

  const result = await promise;
  return { result, wasDeduplicated: false, hash };
}

export function getInflightCount(): number {
  return inflight.size;
}
export function getInflightHashes(): string[] {
  return [...inflight.keys()];
}
export function clearInflight(): void {
  inflight.clear();
}
