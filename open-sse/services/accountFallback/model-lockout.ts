// ─── Per-Model Lockout Tracking ─────────────────────────────────────────────
// In-memory map: "provider:connectionId:model" → entry with parsed fields.
// The model id is stored structurally (not re-parsed from the key) because
// model ids may themselves contain ':' (e.g. "deepseek/deepseek-r1:free").
const modelLockouts = new Map<
  string,
  {
    provider: string;
    connectionId: string;
    model: string;
    reason: string;
    until: number;
    lockedAt: number;
  }
>();

// Auto-cleanup expired lockouts every 15 seconds (lazy init for Cloudflare Workers compatibility)
let _cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupTimer() {
  if (_cleanupTimer) return;
  try {
    _cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of modelLockouts) {
        if (now > entry.until) modelLockouts.delete(key);
      }
    }, 15_000);
    if (typeof _cleanupTimer === "object" && "unref" in _cleanupTimer) {
      (_cleanupTimer as { unref?: () => void }).unref?.(); // Don't prevent process exit (Node.js only)
    }
  } catch {
    // Cloudflare Workers may not support setInterval outside handlers — skip cleanup timer
  }
}

/**
 * Lock a specific model on a specific account
 * @param {string} provider
 * @param {string} connectionId
 * @param {string} model
 * @param {string} reason - from RateLimitReason
 * @param {number} cooldownMs
 */
export function lockModel(provider, connectionId, model, reason, cooldownMs) {
  if (!model) return; // No model → skip model-level locking
  ensureCleanupTimer();
  const key = `${provider}:${connectionId}:${model}`;
  const newUntil = Date.now() + cooldownMs;
  // Preserve the longer cooldown if an existing lock has more time remaining.
  // Safe without a mutex: no await between get/set, so this runs atomically
  // within Node.js's single-threaded event loop.
  const existing = modelLockouts.get(key);
  if (existing && existing.until > newUntil) return;
  modelLockouts.set(key, {
    provider,
    connectionId,
    model,
    reason,
    until: newUntil,
    lockedAt: Date.now(),
  });
}

/**
 * Whether a provider should use per-model lockouts instead of connection-wide cooldowns.
 * Gemini AI Studio has per-model quotas; passthrough providers have independent model limits.
 */
export function hasPerModelQuota(provider: string): boolean {
  // gemini/github gate quota per-model. Ollama Cloud also blocks individual
  // models behind subscription (e.g. glm-5.1 needs paid plan, while smaller
  // models work on the free tier) — locking the whole connection on one
  // gated model would falsely block testing the others.
  if (provider === "gemini" || provider === "github" || provider === "ollama-cloud") return true;
  try {
    const { getPassthroughProviders } = require("../../config/providerRegistry.ts");
    return getPassthroughProviders().has(provider);
  } catch {
    return false;
  }
}

/**
 * Lock a model (not connection) for a provider with per-model quotas.
 * No-ops for providers that don't use per-model lockouts.
 */
export function lockModelIfPerModelQuota(
  provider: string,
  connectionId: string,
  model: string | null,
  reason: string,
  cooldownMs: number
): boolean {
  if (!hasPerModelQuota(provider) || !model) return false;
  lockModel(provider, connectionId, model, reason, cooldownMs);
  return true;
}

/**
 * Check if a specific model on a specific account is locked
 * @returns {boolean}
 */
export function isModelLocked(provider, connectionId, model) {
  if (!model) return false;
  const key = `${provider}:${connectionId}:${model}`;
  const entry = modelLockouts.get(key);
  if (!entry) return false;
  if (Date.now() > entry.until) {
    modelLockouts.delete(key);
    return false;
  }
  return true;
}

/**
 * Get model lockout info (for debugging/dashboard)
 */
export function getModelLockoutInfo(provider, connectionId, model) {
  if (!model) return null;
  const key = `${provider}:${connectionId}:${model}`;
  const entry = modelLockouts.get(key);
  if (!entry || Date.now() > entry.until) return null;
  return {
    reason: entry.reason,
    remainingMs: entry.until - Date.now(),
    lockedAt: new Date(entry.lockedAt).toISOString(),
  };
}

/**
 * Get all active model lockouts (for dashboard)
 */
export function getAllModelLockouts() {
  const now = Date.now();
  const active = [];
  for (const entry of modelLockouts.values()) {
    if (now <= entry.until) {
      active.push({
        provider: entry.provider,
        connectionId: entry.connectionId,
        model: entry.model,
        reason: entry.reason,
        remainingMs: entry.until - now,
      });
    }
  }
  return active;
}
