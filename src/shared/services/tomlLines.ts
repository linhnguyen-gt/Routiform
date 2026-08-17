/**
 * Line-based TOML editing.
 *
 * Codex and Kimi Code both keep their configuration in a TOML file that belongs to the
 * user — profiles, MCP servers, permission rules, an OAuth-provisioned provider block. A
 * parse-and-reserialize round trip would drop their comments and reorder everything, and
 * the repo carries no TOML parser anyway, so managed sections are spliced in and out as
 * lines and every untouched line survives byte for byte.
 *
 * The trade-off this accepts: a section header is recognised only in its `[name]` form, so
 * an inline table (`providers = { routiform = { ... } }`) is invisible here. Both CLIs
 * write the header form themselves, and a hand-written inline table is left alone rather
 * than corrupted.
 */

export const normalizeTomlContent = (content: string | null | undefined) =>
  String(content || "").replace(/\r\n/g, "\n");

export const splitTomlLines = (content: string | null | undefined) => {
  const normalized = normalizeTomlContent(content);
  if (!normalized) return [] as string[];
  const lines = normalized.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
};

const escapeTomlString = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export const toTomlString = (value: string) => `"${escapeTomlString(value)}"`;

/** A bare key needs no quotes; anything else does, including the `/` in a model alias. */
export const toTomlKey = (value: string) =>
  /^[A-Za-z0-9_-]+$/.test(value) ? value : toTomlString(value);

export const getTomlSectionName = (line: string): string | null => {
  const match = line.match(/^\s*\[([^\]]+)\]\s*$/);
  return match ? match[1].trim() : null;
};

const findFirstSectionIndex = (lines: string[]) => {
  const index = lines.findIndex((line) => getTomlSectionName(line) !== null);
  return index === -1 ? lines.length : index;
};

const findRootKeyIndexes = (lines: string[], key: string) => {
  const firstSectionIndex = findFirstSectionIndex(lines);
  const matcher = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=`);
  const indexes: number[] = [];
  for (let index = 0; index < firstSectionIndex; index += 1) {
    if (matcher.test(lines[index])) indexes.push(index);
  }
  return indexes;
};

const upsertRootLine = (lines: string[], key: string, nextLine: string) => {
  const keyIndexes = findRootKeyIndexes(lines, key);

  if (keyIndexes.length > 0) {
    lines[keyIndexes[0]] = nextLine;
    for (let index = keyIndexes.length - 1; index >= 1; index -= 1) {
      lines.splice(keyIndexes[index], 1);
    }
    return;
  }

  let insertAt = findFirstSectionIndex(lines);
  while (insertAt > 0 && lines[insertAt - 1].trim() === "") {
    insertAt -= 1;
  }
  lines.splice(insertAt, 0, nextLine);
};

export const upsertTomlRootKey = (lines: string[], key: string, value: string) =>
  upsertRootLine(lines, key, `${key} = ${toTomlString(value)}`);

/** TOML integers are bare, so a numeric root key cannot go through upsertTomlRootKey. */
export const upsertTomlRootNumber = (lines: string[], key: string, value: number) =>
  upsertRootLine(lines, key, `${key} = ${Math.trunc(value)}`);

export const removeTomlRootKey = (lines: string[], key: string) => {
  const keyIndexes = findRootKeyIndexes(lines, key);
  for (let index = keyIndexes.length - 1; index >= 0; index -= 1) {
    lines.splice(keyIndexes[index], 1);
  }
};

const findSectionRanges = (lines: string[], matches: (sectionName: string) => boolean) => {
  const ranges: Array<{ start: number; end: number }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const sectionName = getTomlSectionName(lines[index]);
    if (sectionName === null || !matches(sectionName)) continue;

    let end = lines.length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (getTomlSectionName(lines[cursor]) !== null) {
        end = cursor;
        break;
      }
    }

    ranges.push({ start: index, end });
    index = end - 1;
  }

  return ranges;
};

export const upsertTomlSection = (lines: string[], sectionName: string, sectionLines: string[]) => {
  const matches = (name: string) => name === sectionName;
  const ranges = findSectionRanges(lines, matches);

  if (ranges.length > 0) {
    for (let index = ranges.length - 1; index >= 1; index -= 1) {
      const range = ranges[index];
      lines.splice(range.start, range.end - range.start);
    }

    const [firstRange] = findSectionRanges(lines, matches);
    if (firstRange) {
      lines.splice(firstRange.start, firstRange.end - firstRange.start, ...sectionLines);
    }
    return;
  }

  if (lines.length > 0 && lines.at(-1)?.trim() !== "") {
    lines.push("");
  }
  lines.push(...sectionLines);
};

export const removeTomlSection = (lines: string[], sectionName: string) =>
  removeTomlSectionsWhere(lines, (name) => name === sectionName);

/** Used to drop every managed model section at once, however many were written last time. */
export const removeTomlSectionsWhere = (
  lines: string[],
  matches: (sectionName: string) => boolean
) => {
  const ranges = findSectionRanges(lines, matches);
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const range = ranges[index];
    lines.splice(range.start, range.end - range.start);
  }
  return ranges.length;
};

export const parseTomlRootValue = (lines: string[], key: string): string | null => {
  const keyIndexes = findRootKeyIndexes(lines, key);
  if (keyIndexes.length === 0) return null;

  const line = lines[keyIndexes[0]];
  const match = line.match(/^\s*[^=]+\s*=\s*(.+)\s*$/);
  if (!match) return null;

  const rawValue = match[1].trim();
  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    return rawValue.slice(1, -1);
  }
  return rawValue;
};

export const finalizeTomlLines = (lines: string[]) => {
  while (lines.length > 0 && lines.at(-1)?.trim() === "") {
    lines.pop();
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
};
