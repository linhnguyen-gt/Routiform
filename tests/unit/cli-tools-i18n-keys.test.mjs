/**
 * Every tool in the catalog needs its copy in the base locale.
 *
 * A locale file carries only its own messages — src/i18n/request.ts loads one file and
 * there is no fallback to `en` — and next-intl reports a missing key through onError
 * rather than throwing. Adding a tool to CLI_TOOLS without its message keys therefore took
 * the whole CLI Tools page down with MISSING_MESSAGE instead of degrading to the catalog's
 * own description.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { CLI_TOOLS } = await import("../../src/shared/constants/cliTools.ts");
const messages = JSON.parse(await readFile("src/i18n/messages/en.json", "utf-8"));

const toolIds = Object.keys(CLI_TOOLS);

test("the base locale describes every tool in the catalog", () => {
  const missing = toolIds.filter((id) => !messages.cliTools?.toolDescriptions?.[id]);

  assert.deepEqual(missing, [], `cliTools.toolDescriptions is missing: ${missing.join(", ")}`);
});

test("the base locale states a use case for every tool in the catalog", () => {
  const missing = toolIds.filter((id) => !messages.cliTools?.toolUseCases?.[id]);

  assert.deepEqual(missing, [], `cliTools.toolUseCases is missing: ${missing.join(", ")}`);
});

test("every tool carries its own description, so the fallback has something to show", () => {
  const missing = toolIds.filter((id) => !String(CLI_TOOLS[id].description || "").trim());

  assert.deepEqual(missing, [], `CLI_TOOLS.description is empty for: ${missing.join(", ")}`);
});
