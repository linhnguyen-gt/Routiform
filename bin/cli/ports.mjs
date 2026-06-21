// Resolve runtime ports — mirrors scripts/runtime-env.mjs but standalone for CLI.
// Allows the CLI to run without importing from scripts/ (which may not be traced).
function parsePort(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

export function resolvePorts(fromEnv = process.env) {
  const basePort = parsePort(fromEnv.PORT || "20128", 20128);
  const apiPort = parsePort(fromEnv.API_PORT || String(basePort), basePort);
  const dashboardPort = parsePort(fromEnv.DASHBOARD_PORT || String(basePort), basePort);
  return { basePort, apiPort, dashboardPort };
}

// Allow --port flag override (from dispatch.mjs global flags).
export function resolvePortsWithOverride(flags) {
  const env = { ...process.env };
  if (flags.port) {
    env.PORT = String(flags.port);
    env.DASHBOARD_PORT = String(flags.port);
  }
  return resolvePorts(env);
}
