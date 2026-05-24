const ROUTIFORM_SECTION_NAME = "model_providers.routiform";

const normalizeContent = (content: string | null | undefined) =>
  String(content || "").replace(/\r\n/g, "\n");

const splitLines = (content: string | null | undefined) => {
  const normalized = normalizeContent(content);
  if (!normalized) return [] as string[];
  const lines = normalized.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
};

const escapeTomlString = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const toTomlString = (value: string) => `"${escapeTomlString(value)}"`;

const getSectionName = (line: string): string | null => {
  const match = line.match(/^\s*\[([^\]]+)\]\s*$/);
  return match ? match[1].trim() : null;
};

const findFirstSectionIndex = (lines: string[]) => {
  const index = lines.findIndex((line) => getSectionName(line) !== null);
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

const upsertRootKey = (lines: string[], key: string, value: string) => {
  const keyIndexes = findRootKeyIndexes(lines, key);
  const nextLine = `${key} = ${toTomlString(value)}`;

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

const removeRootKey = (lines: string[], key: string) => {
  const keyIndexes = findRootKeyIndexes(lines, key);
  for (let index = keyIndexes.length - 1; index >= 0; index -= 1) {
    lines.splice(keyIndexes[index], 1);
  }
};

const findSectionRanges = (lines: string[], sectionName: string) => {
  const ranges: Array<{ start: number; end: number }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (getSectionName(lines[index]) !== sectionName) continue;

    let end = lines.length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (getSectionName(lines[cursor]) !== null) {
        end = cursor;
        break;
      }
    }

    ranges.push({ start: index, end });
    index = end - 1;
  }

  return ranges;
};

const upsertSection = (lines: string[], sectionName: string, sectionLines: string[]) => {
  const ranges = findSectionRanges(lines, sectionName);

  if (ranges.length > 0) {
    for (let index = ranges.length - 1; index >= 1; index -= 1) {
      const range = ranges[index];
      lines.splice(range.start, range.end - range.start);
    }

    const [firstRange] = findSectionRanges(lines, sectionName);
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

const removeSection = (lines: string[], sectionName: string) => {
  const ranges = findSectionRanges(lines, sectionName);
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const range = ranges[index];
    lines.splice(range.start, range.end - range.start);
  }
};

const parseRootValue = (lines: string[], key: string): string | null => {
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

const finalize = (lines: string[]) => {
  while (lines.length > 0 && lines.at(-1)?.trim() === "") {
    lines.pop();
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
};

const normalizeBaseUrl = (baseUrl: string) => (baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`);

export const hasRoutiformCodexConfig = (config: string | null) => {
  if (!config) return false;
  return (
    config.includes('model_provider = "routiform"') ||
    config.includes(`[${ROUTIFORM_SECTION_NAME}]`)
  );
};

export const hasUsableCodexAuth = (authContent: string | null) => {
  if (!authContent) return false;

  try {
    const auth = JSON.parse(authContent) as {
      OPENAI_API_KEY?: unknown;
      auth_mode?: unknown;
      tokens?: {
        id_token?: unknown;
        access_token?: unknown;
        refresh_token?: unknown;
      };
    };
    const apiKey = String(auth?.OPENAI_API_KEY || "").trim();
    if (apiKey.length > 0 && !apiKey.includes("****")) {
      return true;
    }

    const authMode = String(auth?.auth_mode || "")
      .trim()
      .toLowerCase();
    const hasChatGptTokens =
      !!String(auth?.tokens?.id_token || "").trim() ||
      !!String(auth?.tokens?.access_token || "").trim() ||
      !!String(auth?.tokens?.refresh_token || "").trim();

    return authMode === "chatgpt" && hasChatGptTokens;
  } catch {
    return false;
  }
};

export const applyRoutiformCodexConfig = (
  existingConfig: string | null,
  { model, baseUrl }: { model: string; baseUrl: string }
) => {
  const lines = splitLines(existingConfig);

  upsertRootKey(lines, "model", model);
  upsertRootKey(lines, "model_provider", "routiform");
  upsertSection(lines, ROUTIFORM_SECTION_NAME, [
    `[${ROUTIFORM_SECTION_NAME}]`,
    `name = ${toTomlString("Routiform")}`,
    `base_url = ${toTomlString(normalizeBaseUrl(baseUrl))}`,
    `wire_api = ${toTomlString("responses")}`,
  ]);

  return finalize(lines);
};

export const removeRoutiformCodexConfig = (existingConfig: string | null) => {
  const lines = splitLines(existingConfig);
  const modelProvider = parseRootValue(lines, "model_provider");

  if (modelProvider === "routiform") {
    removeRootKey(lines, "model");
    removeRootKey(lines, "model_provider");
  }

  removeSection(lines, ROUTIFORM_SECTION_NAME);

  return finalize(lines);
};
