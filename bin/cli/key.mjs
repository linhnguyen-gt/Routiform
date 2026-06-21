// routiform key <verb>
import { get, post, del } from "./api-client.mjs";
import { printTable, printJson, printKv, printError, printSuccess, paint, C } from "./output.mjs";

export async function keyHandler(verb, args, flags) {
  switch (verb) {
    case "list":
    case "ls":
      return listKeys(flags);
    case "create":
      return createKey(args[0], flags);
    case "reveal":
      return revealKey(args[0], flags);
    case "rm":
    case "remove":
    case "delete":
      return rmKey(args[0], flags);
    default:
      printError(`Unknown verb: key ${verb}`);
      console.log("  Usage: routiform key <list|create|reveal|rm>");
      process.exit(1);
  }
}

async function listKeys(flags) {
  const { ok, data } = await get("/api/keys", flags);
  if (!ok) return printError(data?.error || "Failed to list keys");

  const keys = data.keys || [];
  if (flags.json) return printJson(keys);

  printTable(
    keys.map((k) => ({
      id: k.id,
      name: k.name,
      key: k.key, // already masked by API
    })),
    [
      { key: "id", label: "ID", width: 36 },
      { key: "name", label: "NAME", width: 25 },
      { key: "key", label: "KEY (masked)", width: 30 },
    ]
  );
}

async function createKey(name, flags) {
  if (!name) {
    printError("Usage: routiform key create <name>");
    process.exit(1);
  }
  const { ok, data } = await post("/api/keys", { name }, flags);
  if (!ok) return printError(data?.error || "Failed to create key");
  if (flags.json) return printJson(data);
  printSuccess(`Key created: ${data.name} (id: ${data.id})`);
  console.log(`  ${paint(C.yellow, "Key:")} ${paint(C.bold, data.key)}`);
  console.log(paint(C.gray, "  Save this key — it won't be shown again."));
}

async function revealKey(id, flags) {
  if (!id) {
    printError("Usage: routiform key reveal <id>");
    process.exit(1);
  }
  const { ok, data } = await get(`/api/keys/${id}/reveal`, flags);
  if (!ok) return printError(data?.error || "Failed to reveal key");
  if (flags.json) return printJson(data);
  printSuccess(`Key for ${id}:`);
  console.log(`  ${paint(C.bold, data.key)}`);
}

async function rmKey(id, flags) {
  if (!id) {
    printError("Usage: routiform key rm <id>");
    process.exit(1);
  }
  if (!flags.yes) {
    const answer = await confirm(`Delete key ${id}?`);
    if (!answer) {
      console.log("Cancelled.");
      return;
    }
  }
  const { ok, data } = await del(`/api/keys/${id}`, flags);
  if (!ok) return printError(data?.error || "Failed to delete key");
  printSuccess(`Key ${id} deleted.`);
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
