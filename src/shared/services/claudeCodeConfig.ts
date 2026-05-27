type ClaudeSettingsEnv = Record<string, unknown> | null | undefined;
type ClaudeModelRow = Record<string, unknown> & { id?: string; name?: string };

const CLAUDE_LATEST_FALLBACK_MODELS: ClaudeModelRow[] = [
  { id: "claude-opus-4-7", name: "Claude Opus 4.7" },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
];

export type ClaudeCliConfigStatus = "configured" | "configured_1m" | "not_configured" | "other";
export type ClaudeCliDefaultModelMap = Partial<Record<"opus" | "sonnet" | "haiku", string>>;

function readEnvString(env: ClaudeSettingsEnv, key: string): string {
  const value = env?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function isClaudeCode1mEnabled(env: ClaudeSettingsEnv): boolean {
  const candidateModels = [
    readEnvString(env, "ANTHROPIC_MODEL"),
    readEnvString(env, "ANTHROPIC_DEFAULT_OPUS_MODEL"),
    readEnvString(env, "ANTHROPIC_DEFAULT_SONNET_MODEL"),
  ];

  return candidateModels.some((model) => model.includes("[1m]"));
}

export function stripClaudeCode1mSuffix(model: string | null | undefined): string {
  const value = typeof model === "string" ? model.trim() : "";
  return value.endsWith("[1m]") ? value.slice(0, -4).trim() : value;
}

export function setClaudeCode1mSuffix(
  model: string | null | undefined,
  enabled: boolean,
  fallbackModel = ""
): string {
  const baseModel = stripClaudeCode1mSuffix(model) || stripClaudeCode1mSuffix(fallbackModel);
  if (!baseModel) return "";
  return enabled ? `${baseModel}[1m]` : baseModel;
}

export function getClaudeModelFamily(modelId: string): "opus" | "sonnet" | "haiku" | null {
  if (modelId.startsWith("claude-opus-")) return "opus";
  if (modelId.startsWith("claude-sonnet-")) return "sonnet";
  if (modelId.startsWith("claude-haiku-")) return "haiku";
  if (/^claude-\d+(?:-\d+)?-opus-/.test(modelId)) return "opus";
  if (/^claude-\d+(?:-\d+)?-sonnet-/.test(modelId)) return "sonnet";
  if (/^claude-\d+(?:-\d+)?-haiku-/.test(modelId)) return "haiku";
  return null;
}

function getClaudeReleaseRank(modelId: string): [number, number] {
  const family = getClaudeModelFamily(modelId);
  if (!family) return [0, 0];

  if (modelId.startsWith(`claude-${family}-`)) {
    const tokens = modelId.slice(`claude-${family}-`.length).split("-");
    const major = Number(tokens[0] || 0);
    const maybeMinor = tokens[1] || "";
    const minor = /^\d+$/.test(maybeMinor) && maybeMinor.length < 8 ? Number(maybeMinor) : 0;
    return [major, minor];
  }

  const legacy = modelId.match(/^claude-(\d+)(?:-(\d+))?-(?:opus|sonnet|haiku)-/);
  if (!legacy) return [0, 0];
  return [Number(legacy[1] || 0), Number(legacy[2] || 0)];
}

function compareClaudeModelIds(left: string, right: string): number {
  const [leftMajor, leftMinor] = getClaudeReleaseRank(left);
  const [rightMajor, rightMinor] = getClaudeReleaseRank(right);
  if (leftMajor !== rightMajor) return leftMajor - rightMajor;
  if (leftMinor !== rightMinor) return leftMinor - rightMinor;

  const leftCanonical =
    left.startsWith("claude-opus-") ||
    left.startsWith("claude-sonnet-") ||
    left.startsWith("claude-haiku-");
  const rightCanonical =
    right.startsWith("claude-opus-") ||
    right.startsWith("claude-sonnet-") ||
    right.startsWith("claude-haiku-");
  if (leftCanonical !== rightCanonical) return leftCanonical ? 1 : -1;

  return right.length - left.length;
}

export function filterLatestClaudeModelRows(rows: unknown[]): ClaudeModelRow[] {
  const latestByFamily = new Map<string, ClaudeModelRow>();
  const passthrough: ClaudeModelRow[] = [];

  for (const row of rows) {
    const model = row as ClaudeModelRow;
    const id = typeof model?.id === "string" ? model.id.trim() : "";
    if (!id) continue;

    const family = getClaudeModelFamily(id);
    if (!family) {
      passthrough.push(model);
      continue;
    }

    const current = latestByFamily.get(family);
    const currentId = typeof current?.id === "string" ? current.id : "";
    if (!currentId || compareClaudeModelIds(id, currentId) > 0) {
      latestByFamily.set(family, model);
    }
  }

  return [...latestByFamily.values(), ...passthrough];
}

export function getClaudeLatestFallbackModels(): ClaudeModelRow[] {
  return CLAUDE_LATEST_FALLBACK_MODELS.map((model) => ({ ...model }));
}

export function buildClaudeCliDefaultModelMap(
  rows: unknown[],
  providerAlias = "cc"
): ClaudeCliDefaultModelMap {
  const defaults: ClaudeCliDefaultModelMap = {};
  for (const row of filterLatestClaudeModelRows(rows)) {
    const id =
      typeof (row as ClaudeModelRow)?.id === "string" ? (row as ClaudeModelRow).id!.trim() : "";
    const family = getClaudeModelFamily(id);
    if (!id || !family) continue;
    defaults[family] = `${providerAlias}/${id}`;
  }
  return defaults;
}

export function getClaudeCliConfigStatus(
  env: ClaudeSettingsEnv,
  options: { cloudUrl?: string | null } = {}
): ClaudeCliConfigStatus {
  const currentUrl = readEnvString(env, "ANTHROPIC_BASE_URL");
  if (!currentUrl) return "not_configured";

  const localMatch = currentUrl.includes("localhost") || currentUrl.includes("127.0.0.1");
  const cloudUrl = (options.cloudUrl || "").trim();
  const cloudMatch = cloudUrl.length > 0 && currentUrl.startsWith(cloudUrl);

  if (localMatch || cloudMatch) {
    return isClaudeCode1mEnabled(env) ? "configured_1m" : "configured";
  }

  return "other";
}
