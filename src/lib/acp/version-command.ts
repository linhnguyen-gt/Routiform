/**
 * Parsing and validation for an agent's version command.
 *
 * The command is stored as a single string because that is what the dashboard form collects and
 * what every built-in definition looks like (`claude --version`). It is nonetheless operator input
 * that ends up being executed, so it is tokenized and validated here rather than handed to a shell
 * as written.
 *
 * @module lib/acp/version-command
 */

/**
 * Characters that let a command string mean something other than "run this binary with these
 * arguments". Rejecting them is what makes execution safe on the Windows path below, where a shell
 * is still required.
 *
 * Quotes are rejected too: without a shell they would be passed through literally, so accepting
 * them would silently produce an argument nobody intended.
 */
const SHELL_METACHARACTERS = /[;&|<>$`(){}[\]!*?~\n\r"'\\]/;

/**
 * Split a version command into argv, or return `null` when it is not a plain
 * `binary arg arg` invocation.
 *
 * A `null` result is not an error to report to the operator at detection time — it means the agent
 * cannot be probed, which reads the same as "not installed". At write time it should be a 400.
 */
export function parseVersionCommand(command: unknown): string[] | null {
  if (typeof command !== "string") return null;

  const trimmed = command.trim();
  if (!trimmed) return null;
  if (SHELL_METACHARACTERS.test(trimmed)) return null;

  const argv = trimmed.split(/\s+/).filter(Boolean);
  if (argv.length === 0) return null;

  return argv;
}

/**
 * Whether a version command is safe to store.
 *
 * Kept separate from `parseVersionCommand` so the route reads as a validation check rather than as
 * a parse whose `null` happens to mean "reject".
 */
export function isValidVersionCommand(command: unknown): boolean {
  return parseVersionCommand(command) !== null;
}

/**
 * Windows resolves `claude` to `claude.cmd` through PATHEXT, and Node refuses to run a `.cmd`
 * without a shell. Since the argv above is metacharacter-free, a shell there has nothing to
 * interpret — there is no command to inject. Every other platform runs with no shell at all.
 */
export function needsShellForExec(): boolean {
  return process.platform === "win32";
}
