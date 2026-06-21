// routiform combo <verb>
import { get, post, del } from "./api-client.mjs";
import { printTable, printJson, printKv, printError, printSuccess } from "./output.mjs";

export async function comboHandler(verb, args, flags) {
  switch (verb) {
    case "list":
    case "ls":
      return listCombos(flags);
    case "show":
      return showCombo(args[0], flags);
    case "create":
      return createCombo(args, flags);
    case "rm":
    case "remove":
    case "delete":
      return rmCombo(args[0], flags);
    case "test":
      return testCombo(args[0], flags);
    default:
      printError(`Unknown verb: combo ${verb}`);
      console.log("  Usage: routiform combo <list|show|create|rm|test>");
      process.exit(1);
  }
}

async function listCombos(flags) {
  const { ok, data } = await get("/api/combos", flags);
  if (!ok) return printError(data?.error || "Failed to list combos");

  const combos = data.combos || [];
  if (flags.json) return printJson(combos);

  printTable(
    combos.map((c) => ({
      id: c.id,
      name: c.name,
      strategy: c.strategy || "priority",
      models: Array.isArray(c.models) ? c.models.length : 0,
    })),
    [
      { key: "id", label: "ID", width: 36 },
      { key: "name", label: "NAME", width: 25 },
      { key: "strategy", label: "STRATEGY", width: 15 },
      { key: "models", label: "MODELS", width: 7 },
    ]
  );
}

async function showCombo(id, flags) {
  if (!id) {
    printError("Usage: routiform combo show <id>");
    process.exit(1);
  }
  const { ok, data } = await get(`/api/combos/${id}`, flags);
  if (!ok) return printError(data?.error || "Failed to fetch combo");

  const c = data.combo || data;
  if (flags.json) return printJson(c);

  printKv("ID", c.id);
  printKv("Name", c.name);
  printKv("Strategy", c.strategy || "priority");
  if (Array.isArray(c.models)) {
    console.log("  Models:");
    for (const m of c.models) {
      const name = typeof m === "string" ? m : m.model || m.name || JSON.stringify(m);
      console.log(`    - ${name}`);
    }
  }
}

async function createCombo(args, flags) {
  // Parse: --name n --models a,b,c [--strategy s]
  const parsed = parseFlags(args);
  if (!parsed.name) {
    printError(
      "Usage: routiform combo create --name <name> --models <a,b,c> [--strategy <strategy>]"
    );
    process.exit(1);
  }

  const models = (parsed.models || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const body = {
    name: parsed.name,
    models: models.map((m) => ({ model: m })),
    strategy: parsed.strategy || "priority",
    config: { fallback: { enabled: true } },
  };

  const { ok, data } = await post("/api/combos", body, flags);
  if (!ok) return printError(data?.error || "Failed to create combo");
  printSuccess(`Combo created: ${parsed.name} (${data.id || data.combo?.id || "—"})`);
}

async function rmCombo(id, flags) {
  if (!id) {
    printError("Usage: routiform combo rm <id>");
    process.exit(1);
  }
  if (!flags.yes) {
    const answer = await confirm(`Delete combo ${id}?`);
    if (!answer) {
      console.log("Cancelled.");
      return;
    }
  }
  const { ok, data } = await del(`/api/combos/${id}`, flags);
  if (!ok) return printError(data?.error || "Failed to delete combo");
  printSuccess(`Combo ${id} deleted.`);
}

async function testCombo(name, flags) {
  if (!name) {
    printError("Usage: routiform combo test <name>");
    process.exit(1);
  }
  const { ok, data } = await post("/api/combos/test", { comboName: name }, flags);
  if (!ok) return printError(data?.error || "Test failed");
  if (flags.json) return printJson(data);
  printSuccess(`Combo "${name}" test: ${data.status || data.message || "complete"}`);
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
