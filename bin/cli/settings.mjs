// routiform settings get [key] | routiform settings set <key> <value>
import { get, apiRequest } from "./api-client.mjs";
import { printJson, printKv, printError, printSuccess } from "./output.mjs";

// Whitelist of settings keys safe to set via CLI.
const SAFE_SETTINGS_KEYS = new Set([
  "requireLogin",
  "theme",
  "language",
  "autoBackupEnabled",
  "instanceName",
  "corsOrigins",
  "baseUrl",
  "setupComplete",
  "requireAuthForModels",
  "hideHealthCheckLogs",
  "fallbackStrategy",
  "stickyRoundRobinLimit",
  "intentDetectionEnabled",
  "intentSimpleMaxWords",
  "mcpEnabled",
  "a2aEnabled",
]);

export async function settingsHandler(verb, args, flags) {
  switch (verb) {
    case "get":
      return getSettings(flags);
    case "set":
      return setSettings(args, flags);
    default:
      printError(`Unknown verb: settings ${verb}`);
      console.log("  Usage: routiform settings get | routiform settings set <key> <value>");
      process.exit(1);
  }
}

async function getSettings(flags) {
  const { ok, data } = await get("/api/settings", flags);
  if (!ok) return printError(data?.error || "Failed to fetch settings");
  if (flags.json) return printJson(data);

  // Print a clean summary, omitting sensitive fields
  const { password, ...safe } = data;
  for (const [key, value] of Object.entries(safe)) {
    printKv(key, formatValue(value));
  }
}

async function setSettings(args, flags) {
  const key = args[0];
  const value = args[1];
  if (!key || value === undefined) {
    printError("Usage: routiform settings set <key> <value>");
    console.log("  Use --json for complex values, or set simple values directly.");
    process.exit(1);
  }

  if (!SAFE_SETTINGS_KEYS.has(key)) {
    printError(`Setting "${key}" is not in the CLI-safe whitelist.`);
    console.log("  Safe keys: " + Array.from(SAFE_SETTINGS_KEYS).join(", "));
    console.log(
      "  For other settings, use the dashboard: http://localhost:20128/dashboard/settings"
    );
    process.exit(1);
  }

  // Parse value: booleans, numbers, strings
  const parsed = parseValue(value);
  const body = { [key]: parsed };

  const { ok, data } = await apiRequest("/api/settings", { method: "PATCH", body, flags });
  if (!ok) return printError(data?.error || "Failed to update setting");
  printSuccess(`${key} = ${JSON.stringify(parsed)}`);
}

function parseValue(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw !== "" && !isNaN(Number(raw)) && !raw.includes(".")) return Number(raw);
  return raw;
}

function formatValue(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.length === 0 ? "[]" : `[${value.length} items]`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
