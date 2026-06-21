// HTTP client for the Routiform local API.
// Handles: base URL resolution, auth fallback, friendly error messages.
import { resolvePortsWithOverride } from "./ports.mjs";
import { readApiKeyFromDb } from "./db-key.mjs";

/**
 * Make an authenticated request to the local Routiform API.
 *
 * @param {string} path — e.g. "/api/providers" or "/v1/health"
 * @param {object} [opts] — { method, body, flags }
 * @param {object} [opts.flags] — global CLI flags { port, apiKey, json }
 * @returns {Promise<{ok: boolean, status: number, data: any}>}
 */
export async function apiRequest(path, opts = {}) {
  const { method = "GET", body, flags = {} } = opts;
  const { dashboardPort } = resolvePortsWithOverride(flags);
  const base = `http://localhost:${dashboardPort}`;
  const url = `${base}${path}`;

  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  // Auth: --api-key flag > ROUTIFORM_API_KEY env > DB lookup (lazy, only on 401)
  const explicitKey = flags.apiKey || process.env.ROUTIFORM_API_KEY;
  if (explicitKey) headers["Authorization"] = `Bearer ${explicitKey}`;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    if (
      err &&
      (err.name === "AbortError" ||
        err.code === "ECONNREFUSED" ||
        err.code === "UND_ERR_CONNECT_TIMEOUT")
    ) {
      console.error("✖ Routiform server is not running. Start it with: routiform");
      process.exit(1);
    }
    throw err;
  }

  // 401 → try DB key fallback, then retry once
  if (res.status === 401 && !explicitKey) {
    const dbKey = await readApiKeyFromDb();
    if (dbKey) {
      headers["Authorization"] = `Bearer ${dbKey}`;
      try {
        res = await fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        // fall through to 401 handling
      }
    }
    if (res.status === 401) {
      console.error(
        "✖ Login is enabled. Set ROUTIFORM_API_KEY or create a key in the dashboard (API Manager)."
      );
      process.exit(1);
    }
  }

  let data = null;
  const text = await res.text();
  if (text.length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { ok: res.ok, status: res.status, data };
}

// Convenience helpers
export async function get(path, flags) {
  return apiRequest(path, { method: "GET", flags });
}

export async function post(path, body, flags) {
  return apiRequest(path, { method: "POST", body, flags });
}

export async function del(path, flags) {
  return apiRequest(path, { method: "DELETE", flags });
}

// Check if server is reachable (used by status command).
export async function checkServerReachable(flags = {}) {
  const { dashboardPort } = resolvePortsWithOverride(flags);
  try {
    const res = await fetch(`http://localhost:${dashboardPort}/api/system/version`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
