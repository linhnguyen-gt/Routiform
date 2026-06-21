// routiform provider <verb>
import { get, post, del } from "./api-client.mjs";
import { printTable, printJson, printKv, printError, printSuccess, paint, C } from "./output.mjs";

const OAUTH_PROVIDERS = new Set([
  "claude-code",
  "antigravity",
  "codex",
  "github",
  "cursor",
  "kimi-coding",
  "kilo-code",
  "cline",
  "openclaw",
  "hermes",
]);

export async function providerHandler(verb, args, flags) {
  switch (verb) {
    case "list":
    case "ls":
      return listProviders(flags);
    case "show":
      return showProvider(args[0], flags);
    case "add":
    case "create":
      return addProvider(args, flags);
    case "rm":
    case "remove":
    case "delete":
      return rmProvider(args[0], flags);
    case "test":
      return testProvider(args[0], flags);
    case "sync-models":
      return syncModels(args[0], flags);
    default:
      printError(`Unknown verb: provider ${verb}`);
      console.log("  Usage: routiform provider <list|show|add|rm|test|sync-models>");
      process.exit(1);
  }
}

async function listProviders(flags) {
  const { ok, data } = await get("/api/providers", flags);
  if (!ok) return printError(data?.error || "Failed to list providers");

  const connections = data.connections || [];
  if (flags.json) return printJson(connections);

  printTable(
    connections.map((c) => ({
      id: c.id,
      name: c.name || c.provider,
      type: c.provider,
      auth: c.authType || "apikey",
      status: c.testStatus || "—",
      enabled: c.isActive === false ? "off" : "on",
    })),
    [
      { key: "id", label: "ID", width: 36 },
      { key: "name", label: "NAME", width: 20 },
      { key: "type", label: "TYPE", width: 18 },
      { key: "auth", label: "AUTH", width: 6 },
      { key: "status", label: "STATUS", width: 10 },
      { key: "enabled", label: "ENABLED", width: 7 },
    ]
  );
}

async function showProvider(id, flags) {
  if (!id) {
    printError("Usage: routiform provider show <id>");
    process.exit(1);
  }
  const { ok, data } = await get(`/api/providers/${id}`, flags);
  if (!ok) return printError(data?.error || "Failed to fetch provider");

  const c = data.connection;
  if (flags.json) return printJson(c);

  printKv("ID", c.id, C.cyan);
  printKv("Name", c.name);
  printKv("Provider", c.provider);
  printKv("Auth Type", c.authType || "apikey");
  printKv("Priority", c.priority);
  printKv("Default Model", c.defaultModel || "—");
  printKv("Test Status", c.testStatus || "—");
  printKv("Active", c.isActive === false ? "off" : "on");
  if (c.models) printKv("Models", Array.isArray(c.models) ? c.models.length + " models" : "—");
}

async function addProvider(args, flags) {
  // Parse: --type <t> --key <apikey> [--name n] [--base-url u]
  const parsed = parseFlags(args);
  if (!parsed.type || !parsed.key) {
    printError(
      "Usage: routiform provider add --type <provider> --key <apikey> [--name <name>] [--base-url <url>]"
    );
    console.log("  --type    Provider type (e.g. openai, anthropic, deepseek, groq, ...)");
    console.log("  --key     API key for the provider");
    console.log("  --name    Display name (optional)");
    console.log("  --base-url  Custom base URL (for openai-compatible-* / anthropic-compatible-*)");
    process.exit(1);
  }

  if (OAUTH_PROVIDERS.has(parsed.type)) {
    printError(`Provider "${parsed.type}" uses OAuth login. Use the dashboard to add it:`);
    console.log(`  ${paint(C.cyan, "http://localhost:20128/dashboard/providers")}`);
    process.exit(1);
  }

  const body = {
    provider: parsed.type,
    apiKey: parsed.key,
    name: parsed.name || parsed.type,
  };
  if (parsed.baseUrl) {
    body.providerSpecificData = { baseUrl: parsed.baseUrl };
  }

  const { ok, data } = await post("/api/providers", body, flags);
  if (!ok) return printError(data?.error || "Failed to add provider");
  printSuccess(`Provider added: ${parsed.type} (${data.id || data.connection?.id || "—"})`);
}

async function rmProvider(id, flags) {
  if (!id) {
    printError("Usage: routiform provider rm <id>");
    process.exit(1);
  }
  if (!flags.yes) {
    const answer = await confirm(`Delete provider ${id}?`);
    if (!answer) {
      console.log("Cancelled.");
      return;
    }
  }
  const { ok, data } = await del(`/api/providers/${id}`, flags);
  if (!ok) return printError(data?.error || "Failed to delete provider");
  printSuccess(`Provider ${id} deleted.`);
}

async function testProvider(id, flags) {
  if (!id) {
    printError("Usage: routiform provider test <id>");
    process.exit(1);
  }
  const { ok, data } = await post(`/api/providers/${id}/test`, {}, flags);
  if (!ok) return printError(data?.error || "Test failed");
  if (flags.json) return printJson(data);
  printSuccess(`Provider ${id}: ${data.status || data.message || "test complete"}`);
}

async function syncModels(id, flags) {
  if (!id) {
    printError("Usage: routiform provider sync-models <id>");
    process.exit(1);
  }
  const { ok, data } = await post(`/api/providers/${id}/sync-models`, {}, flags);
  if (!ok) return printError(data?.error || "Sync failed");
  if (flags.json) return printJson(data);
  printSuccess(`Models synced for ${id}: ${data.models?.length || data.count || "done"}`);
}

function parseFlags(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      out[key] = args[i + 1];
      i++;
    }
  }
  return out;
}

async function confirm(question) {
  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`  ${question} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}
