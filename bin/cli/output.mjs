// Output formatting: table renderer + --json passthrough + colors.
// Minimal — no external deps. Colors reuse ANSI codes from routiform.mjs style.

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

const isTTY = process.stdout.isTTY;
function paint(color, text) {
  return isTTY ? `${color}${text}${C.reset}` : text;
}

// Print raw JSON when --json flag is set.
export function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

// Print a simple table from an array of objects.
// columns: array of { key, label, width } — width is char count.
export function printTable(rows, columns) {
  if (!rows || rows.length === 0) {
    console.log(paint(C.gray, "  (no results)"));
    return;
  }

  // Build header
  const header = columns
    .map((col) => paint(C.bold, pad(col.label, col.width)))
    .join(paint(C.gray, "  "));
  console.log(header);
  console.log(paint(C.gray, "  " + columns.map((c) => "-".repeat(c.width)).join("  ")));

  for (const row of rows) {
    const line = columns
      .map((col) => {
        const val = getNested(row, col.key);
        const str = val === null || val === undefined ? "" : String(val);
        return pad(str.slice(0, col.width), col.width);
      })
      .join("  ");
    console.log("  " + line);
  }
}

function getNested(obj, path) {
  return path
    .split(".")
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function pad(str, width) {
  if (!str) return " ".repeat(width);
  return str.length >= width ? str : str + " ".repeat(width - str.length);
}

// Print a key-value summary (for show/status commands).
export function printKv(label, value, color) {
  const valStr = value === null || value === undefined ? paint(C.gray, "—") : String(value);
  console.log(`  ${paint(C.dim, label.padEnd(16))} ${color ? paint(color, valStr) : valStr}`);
}

// Print an error message.
export function printError(msg) {
  console.error(paint(C.red, "✖ " + msg));
}

// Print a success message.
export function printSuccess(msg) {
  console.log(paint(C.green, "✓ " + msg));
}

export { C, paint };
