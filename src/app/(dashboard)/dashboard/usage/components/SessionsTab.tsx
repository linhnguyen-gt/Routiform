"use client";

import { useTranslations } from "next-intl";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/shared/components";

export default function SessionsTab() {
  const t = useTranslations("usage");
  const tc = useTranslations("common");
  const [data, setData] = useState({ count: 0, sessions: [] });
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      if (res.ok) setData(await res.json());
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 5000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  const formatAge = (ms) => {
    if (ms < 60000) return t("durationSecondsShort", { value: Math.floor(ms / 1000) });
    if (ms < 3600000) return t("durationMinutesShort", { value: Math.floor(ms / 60000) });
    return t("durationHoursShort", { value: Math.floor(ms / 3600000) });
  };

  if (loading) {
    return (
      <Card className="rounded-xl border-border/50 shadow-sm">
        <div className="flex items-center justify-center gap-3 py-10 text-sm text-text-muted">
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-cyan-500/25 border-t-cyan-500"
            aria-hidden
          />
          <span>{tc("loading")}</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border-border/50 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className="rounded-xl bg-cyan-500/10 p-2.5 text-cyan-500 ring-1 ring-cyan-500/20">
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
            fingerprint
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold tracking-tight">{t("activeSessions")}</h3>
          <p className="text-sm text-text-muted">{t("sessionsTrackedHint")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
            <span className="text-sm font-semibold tabular-nums text-cyan-400">{data.count}</span>
          </span>
        </div>
      </div>

      {data.sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-bg-subtle/30 py-10 text-center text-text-muted">
          <span
            className="material-symbols-outlined mb-2 block text-[40px] opacity-40"
            aria-hidden="true"
          >
            fingerprint
          </span>
          <p className="text-sm font-medium text-text-main">{t("noSessions")}</p>
          <p className="mt-1 text-xs">{t("sessionsHint")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-bg-subtle/30">
                <th className="text-left py-2 px-3 text-xs font-semibold text-text-muted uppercase tracking-wider">
                  {t("session")}
                </th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-text-muted uppercase tracking-wider">
                  {t("age")}
                </th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-text-muted uppercase tracking-wider">
                  {t("requests")}
                </th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-text-muted uppercase tracking-wider">
                  {t("connection")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((s) => (
                <tr
                  key={s.sessionId}
                  className="border-b border-border/10 hover:bg-surface/20 transition-colors"
                >
                  <td className="py-2.5 px-3">
                    <span className="font-mono text-xs px-2 py-1 rounded bg-surface/40 text-text-muted">
                      {s.sessionId.slice(0, 12)}…
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-text-muted tabular-nums">{formatAge(s.ageMs)}</td>
                  <td className="py-2.5 px-3 text-right">
                    <span className="font-semibold tabular-nums">{s.requestCount}</span>
                  </td>
                  <td className="py-2.5 px-3">
                    {s.connectionId ? (
                      <span className="text-xs font-mono text-cyan-400">
                        {s.connectionId.slice(0, 10)}
                      </span>
                    ) : (
                      <span className="text-text-muted/40">{t("notAvailableSymbol")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
