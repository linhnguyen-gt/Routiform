export function stripAnthropicMessagesSuffix(baseUrl: string | null | undefined): string {
  const normalized = String(baseUrl || "")
    .trim()
    .replace(/\/$/, "");
  if (!normalized) return "";
  return normalized.split("?")[0].replace(/\/messages$/i, "");
}

export function stripClaudeCodeCompatibleEndpointSuffix(
  baseUrl: string | null | undefined
): string {
  const normalized = String(baseUrl || "")
    .trim()
    .replace(/\/$/, "");
  if (!normalized) return "";
  return normalized.split("?")[0].replace(/\/(?:v\d+\/)?messages$/i, "");
}

function joinNormalizedBaseUrlAndPath(baseUrl: string, path: string): string {
  const normalizedBase = String(baseUrl || "").replace(/\/$/, "");
  const normalizedPath = String(path || "").startsWith("/")
    ? String(path)
    : `/${String(path || "")}`;
  const versionMatch = normalizedBase.match(/(\/v\d+)$/i);
  if (
    versionMatch &&
    normalizedPath.toLowerCase().startsWith(`${versionMatch[1].toLowerCase()}/`)
  ) {
    return `${normalizedBase}${normalizedPath.slice(versionMatch[1].length)}`;
  }
  return `${normalizedBase}${normalizedPath}`;
}

export function joinBaseUrlAndPath(baseUrl: string, path: string): string {
  return joinNormalizedBaseUrlAndPath(stripAnthropicMessagesSuffix(baseUrl), path);
}

export function joinClaudeCodeCompatibleUrl(baseUrl: string, path: string): string {
  return joinNormalizedBaseUrlAndPath(stripClaudeCodeCompatibleEndpointSuffix(baseUrl), path);
}
