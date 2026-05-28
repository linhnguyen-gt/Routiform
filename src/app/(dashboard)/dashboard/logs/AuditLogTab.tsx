"use client";

/**
 * Audit Log Tab — Embedded version of the audit-log page for the Logs dashboard.
 * Fetches from /api/compliance/audit-log with filter support.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";

interface AuditEntry {
  id: number;
  timestamp: string;
  action: string;
  actor: string;
  target: string | null;
  details: Record<string, unknown> | string | null;
  ip_address: string | null;
}

interface DetailFact {
  key: string;
  label: string;
  value: string;
}

const PAGE_SIZE = 25;
const IMPORTANT_DETAIL_KEYS = [
  "provider",
  "name",
  "authType",
  "tokenPrefix",
  "count",
  "returned",
  "providersCount",
  "apiKeysCount",
  "revoked",
  "isActive",
  "status",
  "mode",
  "error",
];

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function formatTitleCase(value: string): string {
  return value
    .split(/[\s._:-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatActionLabel(action: string): string {
  return formatTitleCase(action);
}

function formatActor(actor: string) {
  if (!actor) return "System";
  if (actor === "dashboard") return "Dashboard";
  if (actor === "api_key") return "API key";
  if (actor === "management") return "Management";
  if (actor === "system") return "System";
  if (actor.startsWith("sync-token:")) return `Sync token ${actor.replace("sync-token:", "")}`;
  return formatTitleCase(actor);
}

function formatTarget(target: string | null) {
  if (!target) return null;
  if (target.startsWith("provider:")) {
    const [, provider, connectionId] = target.split(":");
    return connectionId ? `${provider} #${connectionId}` : provider;
  }
  if (target === "sync_bundle") return "Sync bundle";
  if (target === "sync_tokens") return "Sync tokens";
  if (target === "audit_log") return "Audit log";
  return target;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return `${value.length} items`;
  if (typeof value === "object") return "Object";
  return String(value);
}

function getActionTone(action: string) {
  const normalized = action.toLowerCase();
  if (
    normalized.includes("delete") ||
    normalized.includes("remove") ||
    normalized.includes("revoke")
  ) {
    return {
      badge: "bg-red-500/15 text-red-400 border-red-500/20",
      dot: "bg-red-400",
      icon: "delete",
    };
  }

  if (normalized.includes("create") || normalized.includes("add") || normalized.includes("issue")) {
    return {
      badge: "bg-green-500/15 text-green-400 border-green-500/20",
      dot: "bg-green-400",
      icon: "add_circle",
    };
  }

  if (
    normalized.includes("update") ||
    normalized.includes("change") ||
    normalized.includes("enable") ||
    normalized.includes("disable")
  ) {
    return {
      badge: "bg-blue-500/15 text-blue-400 border-blue-500/20",
      dot: "bg-blue-400",
      icon: "edit",
    };
  }

  if (
    normalized.includes("auth") ||
    normalized.includes("login") ||
    normalized.includes("security")
  ) {
    return {
      badge: "bg-purple-500/15 text-purple-400 border-purple-500/20",
      dot: "bg-purple-400",
      icon: "shield",
    };
  }

  return {
    badge: "bg-gray-500/15 text-gray-300 border-gray-500/20",
    dot: "bg-gray-400",
    icon: "info",
  };
}

function buildSummary(entry: AuditEntry): string {
  const details = toRecord(entry.details);
  const provider = typeof details?.provider === "string" ? details.provider : null;
  const name = typeof details?.name === "string" ? details.name : null;
  const tokenPrefix = typeof details?.tokenPrefix === "string" ? details.tokenPrefix : null;
  const count = typeof details?.count === "number" ? details.count : null;
  const returned = typeof details?.returned === "number" ? details.returned : null;
  const providersCount =
    typeof details?.providersCount === "number" ? details.providersCount : null;
  const apiKeysCount = typeof details?.apiKeysCount === "number" ? details.apiKeysCount : null;
  const target = formatTarget(entry.target);
  const action = entry.action.toLowerCase();

  if (action === "provider.connection.create") {
    const label = name || provider || target || "provider connection";
    return `Created provider connection ${label}.`;
  }

  if (action === "sync.bundle.read") {
    return `Sync bundle read with ${providersCount ?? 0} providers and ${apiKeysCount ?? 0} API keys.`;
  }

  if (action === "sync.bundle.read_not_modified") {
    return "Sync bundle checked with no payload changes.";
  }

  if (action === "sync.token.create") {
    return tokenPrefix ? `Issued sync token ${tokenPrefix}.` : "Issued a new sync token.";
  }

  if (action === "sync.token.revoke") {
    return "Revoked a sync token.";
  }

  if (action === "sync.token.list") {
    return typeof count === "number" ? `Listed ${count} sync tokens.` : "Listed sync tokens.";
  }

  if (action === "sync.token.get") {
    return "Viewed sync token details.";
  }

  if (action === "server.start") {
    return "Server start event recorded.";
  }

  if (returned !== null) {
    return `Returned ${returned} audit log entries.`;
  }

  if (count !== null) {
    return `${formatActionLabel(entry.action)} completed for ${count.toLocaleString()} items.`;
  }

  if (provider || name || target) {
    return `${formatActionLabel(entry.action)} on ${name || provider || target}.`;
  }

  return formatActionLabel(entry.action);
}

function extractDetailFacts(details: AuditEntry["details"]): DetailFact[] {
  const record = toRecord(details);
  if (!record) return [];

  return IMPORTANT_DETAIL_KEYS.flatMap((key) => {
    if (!(key in record)) return [];

    const rawValue = record[key];
    if (rawValue === null || rawValue === undefined || rawValue === "") return [];

    return [
      {
        key,
        label: formatTitleCase(key),
        value: formatValue(rawValue),
      },
    ];
  }).slice(0, 4);
}

function formatRawDetails(details: AuditEntry["details"]): string | null {
  if (!details) return null;
  if (typeof details === "string") return details;

  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return null;
  }
}

export default function AuditLogTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const t = useTranslations("logs");

  const getText = useCallback(
    (key: string, fallback: string) =>
      typeof t.has === "function" && t.has(key) ? t(key) : fallback,
    [t]
  );

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.set("action", actionFilter);
      if (actorFilter) params.set("actor", actorFilter);
      params.set("limit", String(PAGE_SIZE + 1));
      params.set("offset", String(offset));

      const res = await fetch(`/api/compliance/audit-log?${params.toString()}`);
      if (!res.ok) throw new Error(t("failedFetchAuditLog"));
      const data: AuditEntry[] = await res.json();

      setHasMore(data.length > PAGE_SIZE);
      setEntries(data.slice(0, PAGE_SIZE));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("failedFetchAuditLog");
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, actorFilter, offset, t]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleSearch = () => {
    setOffset(0);
    fetchEntries();
  };

  const formatTimestamp = (ts: string) => {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text-main)]">{t("auditLog")}</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t("auditLogDesc")}</p>
        </div>
        <button
          onClick={fetchEntries}
          disabled={loading}
          aria-label={t("refreshAuditLogAria")}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text-main)] transition-colors hover:bg-[var(--color-bg-alt)] disabled:opacity-50"
        >
          {loading ? t("loading") : t("refresh")}
        </button>
      </div>

      <div
        className="flex flex-wrap gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        role="search"
        aria-label={t("filterEntriesAria")}
      >
        <input
          type="text"
          placeholder={t("filterByAction")}
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          aria-label={t("filterByActionTypeAria")}
          className="min-w-[180px] flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text-main)] placeholder:text-[var(--color-text-muted)] focus:outline-2 focus:outline-[var(--color-accent)]"
        />
        <input
          type="text"
          placeholder={t("filterByActor")}
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          aria-label={t("filterByActorAria")}
          className="min-w-[180px] flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text-main)] placeholder:text-[var(--color-text-muted)] focus:outline-2 focus:outline-[var(--color-accent)]"
        />
        <button
          onClick={handleSearch}
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] focus:outline-2 focus:outline-[var(--color-accent)] focus:outline-offset-2"
        >
          {t("search")}
        </button>
      </div>

      {error && (
        <div
          className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--color-text-muted)]">
          {t("showing", { count: entries.length, offset })}
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">
          {getText(
            "auditFocusHint",
            "Showing only the most useful event context. Expand an item for raw details."
          )}
        </p>
      </div>

      <div className="space-y-3" aria-label={t("tableAria")}>
        {entries.length === 0 && !loading ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-10 text-center text-[var(--color-text-muted)]">
            {t("noEntries")}
          </div>
        ) : (
          entries.map((entry) => {
            const tone = getActionTone(entry.action);
            const facts = extractDetailFacts(entry.details);
            const rawDetails = formatRawDetails(entry.details);
            const target = formatTarget(entry.target);

            return (
              <article
                key={entry.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-colors hover:bg-[var(--color-bg-alt)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} aria-hidden="true" />
                      <span
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${tone.badge}`}
                      >
                        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                          {tone.icon}
                        </span>
                        {formatActionLabel(entry.action)}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-[var(--color-text-main)]">
                      {buildSummary(entry)}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--color-text-muted)]">
                      <span className="rounded-full border border-[var(--color-border)] px-2 py-1">
                        {t("actor")}: {formatActor(entry.actor)}
                      </span>
                      {target && (
                        <span className="rounded-full border border-[var(--color-border)] px-2 py-1">
                          {t("target")}: {target}
                        </span>
                      )}
                      {entry.ip_address && (
                        <span className="rounded-full border border-[var(--color-border)] px-2 py-1 font-mono">
                          {t("ipAddress")}: {entry.ip_address}
                        </span>
                      )}
                    </div>

                    {facts.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {facts.map((fact) => (
                          <span
                            key={`${entry.id}-${fact.key}`}
                            className="rounded-lg bg-black/5 px-2.5 py-1 text-xs text-[var(--color-text-muted)] dark:bg-white/5"
                          >
                            <span className="font-medium text-[var(--color-text-main)]">
                              {fact.label}:
                            </span>{" "}
                            {fact.value}
                          </span>
                        ))}
                      </div>
                    )}

                    {rawDetails && (
                      <details className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/60 p-3">
                        <summary className="cursor-pointer text-xs font-medium text-[var(--color-text-main)]">
                          {getText("viewRawDetails", "View raw details")}
                        </summary>
                        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-[var(--color-text-muted)]">
                          {rawDetails}
                        </pre>
                      </details>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-xs font-mono text-[var(--color-text-muted)]">
                      {formatTimestamp(entry.timestamp)}
                    </p>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          disabled={offset === 0}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-main)] transition-colors hover:bg-[var(--color-bg-alt)] disabled:opacity-30"
        >
          ← {t("previous")}
        </button>
        <button
          onClick={() => setOffset(offset + PAGE_SIZE)}
          disabled={!hasMore}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-main)] transition-colors hover:bg-[var(--color-bg-alt)] disabled:opacity-30"
        >
          {t("next")} →
        </button>
      </div>
    </div>
  );
}
