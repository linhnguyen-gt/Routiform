// CLI dispatch — parses <noun> <verb> [flags] and routes to the right handler.
// Entry point called from bin/routiform.mjs when argv[2] is a management noun.
import { printError } from "./output.mjs";

const NOUNS = new Set([
  "provider",
  "key",
  "combo",
  "model",
  "settings",
  "status",
  "usage",
  "logs",
  "setup",
]);

const HELP = `
${"\x1b[1m\x1b[36m"}Routiform CLI${"\x1b[0m"} — manage your Routiform proxy from the terminal.

${"\x1b[1m"}Usage:${"\x1b[0m"}
  routiform <noun> <verb> [args] [flags]

${"\x1b[1m"}Commands:${"\x1b[0m"}
  routiform status                              Show server status, version, URLs
  routiform provider list                       List configured providers
  routiform provider show <id>                  Show provider details
  routiform provider add --type <t> --key <k> [--name <n>] [--base-url <u>]
                                                Add an API-key provider
  routiform provider rm <id>                    Remove a provider (confirm prompt)
  routiform provider test <id>                  Test a provider connection
  routiform provider sync-models <id>          Sync models for a provider
  routiform key list                            List API keys (masked)
  routiform key create <name>                   Create a new API key (shown once)
  routiform key reveal <id>                     Reveal a full API key
  routiform key rm <id>                         Delete an API key (confirm prompt)
  routiform combo list                           List combos
  routiform combo show <id>                      Show combo details
  routiform combo create --name <n> --models <a,b,c> [--strategy <s>]
                                                Create a combo
  routiform combo rm <id>                       Remove a combo (confirm prompt)
  routiform combo test <name>                   Test a combo
  routiform model list [--provider <id>]       List synced available models
  routiform settings get                        Show all settings
  routiform settings set <key> <value>          Set a safe-to-CLI setting
  routiform usage                               Show usage summary (30d)
  routiform logs [--tail <N>]                   Show recent server logs
  routiform setup claude [--port N] [--api-key K] [--dry-run]
                                                Point Claude Code at Routiform
  routiform setup codex [--port N] [--api-key K] [--model M] [--dry-run]
                                                Point Codex CLI at Routiform

${"\x1b[1m"}Global flags:${"\x1b[0m"}
  --json          Output raw JSON (for scripting)
  --port <n>      Override the dashboard port (default: 20128)
  --api-key <k>   Override auth (Bearer token)
  --yes           Skip confirmation prompts for destructive commands
  -h, --help      Show this help

${"\x1b[1m"}Docker:${"\x1b[0m"}
  docker exec routiform provider list
  docker exec routiform status

${"\x1b[1m"}Notes:${"\x1b[0m"}
  The Routiform server must be running. Start it with: routiform
  If login is enabled, set ROUTIFORM_API_KEY or use --api-key.
`;

export async function run(argv) {
  // argv = ["provider", "list", "--json", ...]
  const noun = argv[0];
  const verb = argv[1];
  const rest = argv.slice(2);

  if (!noun || noun === "-h" || noun === "--help") {
    console.log(HELP);
    return;
  }

  if (!NOUNS.has(noun)) {
    printError(`Unknown command: routiform ${noun}`);
    console.log('  Run "routiform --help" for available commands.');
    process.exit(1);
  }

  // Parse global flags from rest
  const flags = parseGlobalFlags(rest);
  if (verb === "-h" || verb === "--help") {
    console.log(HELP);
    return;
  }

  // Route to handler
  const handlerArgs = rest.filter((a) => !a.startsWith("--") || isValueFlag(a, rest));

  switch (noun) {
    case "provider": {
      const { providerHandler } = await import("./provider.mjs");
      return providerHandler(verb, handlerArgs, flags);
    }
    case "key": {
      const { keyHandler } = await import("./key.mjs");
      return keyHandler(verb, handlerArgs, flags);
    }
    case "combo": {
      const { comboHandler } = await import("./combo.mjs");
      return comboHandler(verb, handlerArgs, flags);
    }
    case "model": {
      const { modelHandler } = await import("./model.mjs");
      return modelHandler(verb, handlerArgs, flags);
    }
    case "settings": {
      const { settingsHandler } = await import("./settings.mjs");
      return settingsHandler(verb, handlerArgs, flags);
    }
    case "status": {
      const { statusHandler } = await import("./status.mjs");
      return statusHandler(verb, handlerArgs, flags);
    }
    case "usage": {
      const { usageHandler } = await import("./status.mjs");
      return usageHandler(verb, handlerArgs, flags);
    }
    case "logs": {
      const { logsHandler } = await import("./status.mjs");
      return logsHandler(verb, handlerArgs, flags);
    }
    case "setup": {
      const { setupHandler } = await import("./setup.mjs");
      return setupHandler(verb, handlerArgs, flags);
    }
  }
}

function parseGlobalFlags(args) {
  const flags = { json: false, yes: false, dryRun: false, port: null, apiKey: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") flags.json = true;
    else if (a === "--yes" || a === "-y") flags.yes = true;
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--port") {
      flags.port = parseInt(args[i + 1], 10);
      i++;
    } else if (a === "--api-key") {
      flags.apiKey = args[i + 1];
      i++;
    }
  }
  return flags;
}

// Determine if a --flag is a value-taking flag (so it's not filtered out as a noun/verb).
// We keep ALL args that start with -- in handlerArgs because handlers parse their own flags.
function isValueFlag(arg, args) {
  return arg.startsWith("--");
}

export { NOUNS, HELP };
