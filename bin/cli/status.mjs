// routiform status | routiform usage | routiform logs [--tail N]
import { get, apiRequest, checkServerReachable } from "./api-client.mjs";
import { resolvePortsWithOverride } from "./ports.mjs";
import { printJson, printKv, printError, printSuccess, paint, C } from "./output.mjs";

export async function statusHandler(verb, args, flags) {
  // status, usage, logs all route here based on the noun (dispatch sends noun)
  // This handler is called for "status" noun only.
  return showStatus(flags);
}

export async function showStatus(flags) {
  const reachable = await checkServerReachable(flags);
  if (!reachable) {
    printError("Routiform server is not running. Start it with: routiform");
    process.exit(1);
  }

  const { ok, data } = await get("/api/system/version", flags);
  if (!ok) return printError(data?.error || "Failed to fetch version");
  if (flags.json) return printJson(data);

  const { dashboardPort, apiPort } = resolvePortsWithOverride(flags);
  printSuccess("Routiform server is running.");
  printKv("Version", data.current, C.cyan);
  printKv("Latest", data.latest || "—");
  printKv("Update available", data.updateAvailable ? paint(C.yellow, "yes") : "no");
  printKv("Channel", data.channel || "—");
  printKv("Dashboard", paint(C.blue, `http://localhost:${dashboardPort}/dashboard`));
  printKv("API base", paint(C.blue, `http://localhost:${dashboardPort}/v1`));
  printKv("API port", apiPort);
}

export async function usageHandler(verb, args, flags) {
  const { ok, data } = await apiRequest("/api/usage/analytics?range=30d", { flags });
  if (!ok) return printError(data?.error || "Failed to fetch usage");
  if (flags.json) return printJson(data);

  // Print a summary — the analytics response is complex; just show top-level stats.
  const stats = data.summary || data.totals || data;
  printSuccess("Usage (30d):");
  for (const [key, value] of Object.entries(stats)) {
    if (typeof value === "object") continue;
    printKv(key, formatNum(value));
  }
}

export async function logsHandler(verb, args, flags) {
  const tailIdx = args.indexOf("--tail");
  const limit = tailIdx !== -1 && args[tailIdx + 1] ? parseInt(args[tailIdx + 1], 10) : 50;

  const { ok, data } = await apiRequest(`/api/logs/console?limit=${limit}`, { flags });
  if (!ok) return printError(data?.error || "Failed to fetch logs");
  if (flags.json) return printJson(data);

  if (!Array.isArray(data) || data.length === 0) {
    console.log(paint(C.gray, "  (no logs)"));
    return;
  }

  for (const entry of data) {
    const level = entry.level || "info";
    const time = entry.time ? new Date(entry.time).toISOString().slice(11, 19) : "—";
    const msg = entry.msg || "";
    const levelColor =
      level === "error" || level === 50
        ? C.red
        : level === "warn" || level === 40
          ? C.yellow
          : level === "info" || level === 30
            ? C.cyan
            : C.gray;
    console.log(`  ${paint(C.gray, time)} ${paint(levelColor, pad(level, 5))} ${msg}`);
  }
}

function pad(str, width) {
  return str.length >= width ? str : str + " ".repeat(width - str.length);
}

function formatNum(value) {
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}
