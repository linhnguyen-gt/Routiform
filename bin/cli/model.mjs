// routiform model list
import { get } from "./api-client.mjs";
import { printTable, printJson, printError } from "./output.mjs";

export async function modelHandler(verb, args, flags) {
  if (verb !== "list" && verb !== "ls") {
    printError(`Unknown verb: model ${verb}`);
    console.log("  Usage: routiform model list [--provider <id>]");
    process.exit(1);
  }
  return listModels(args, flags);
}

async function listModels(args, flags) {
  const provider = parseFlag(args, "--provider");
  const path = provider
    ? `/api/synced-available-models?provider=${encodeURIComponent(provider)}`
    : "/api/synced-available-models";
  const { ok, data } = await get(path, flags);
  if (!ok) return printError(data?.error || "Failed to list models");

  // Response shape: { models: [...] } when provider given, or { providerId: [...] } for all
  let models = [];
  if (Array.isArray(data.models)) {
    models = data.models;
  } else if (data && typeof data === "object") {
    // All providers: { "provider-id": [{ id, ... }], ... }
    for (const [provId, list] of Object.entries(data)) {
      if (Array.isArray(list)) {
        for (const m of list) {
          models.push({ provider: provId, model: m.id || m.model || m.name || "—" });
        }
      }
    }
  }

  if (flags.json) return printJson(data);

  printTable(
    models.map((m) => ({
      provider: m.provider || provider || "—",
      model: m.model || m.id || m.name || "—",
    })),
    [
      { key: "provider", label: "PROVIDER", width: 20 },
      { key: "model", label: "MODEL ID", width: 50 },
    ]
  );
}

function parseFlag(args, flagName) {
  const idx = args.indexOf(flagName);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}
