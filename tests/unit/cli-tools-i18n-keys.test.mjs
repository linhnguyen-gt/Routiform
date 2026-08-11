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

test("every guide step and note carries its own text, so the fallback has something to show", () => {
  // The card looks up guides.<tool>.steps.<step>.{title,desc} and guides.<tool>.notes.<index>
  // per rendered row. Only 5 of the 16 tools have those messages, so most rows reach the
  // catalog text instead — an empty title or note there renders as a blank line.
  const empty = [];

  for (const id of toolIds) {
    for (const step of CLI_TOOLS[id].guideSteps || []) {
      if (!String(step.title || "").trim()) empty.push(`${id}.guideSteps[${step.step}].title`);
    }
    (CLI_TOOLS[id].notes || []).forEach((note, index) => {
      if (!String(note.text || "").trim()) empty.push(`${id}.notes[${index}].text`);
    });
  }

  assert.deepEqual(empty, [], `CLI_TOOLS guide text is empty for: ${empty.join(", ")}`);
});
