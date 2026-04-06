"use client";

import { useTranslations } from "next-intl";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/shared/components";

export default function RateLimitStatus() {
  const t = useTranslations("usage");
  const tc = useTranslations("common");
  const [data, setData] = useState({ lockouts: [], cacheStats: null });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/rate-limits");
      if (res.ok) setData(await res.json());
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  const formatMs = (ms) => {
    if (ms < 1000) return t("durationMillisecondsShort", { value: ms });
    if (ms < 60000) return t("durationSecondsShort", { value: Math.ceil(ms / 1000) });
    return t("durationMinutesShort", { value: Math.ceil(ms / 60000) });
  };

  if (loading) {
    return (
      <Card className="rounded-xl border-border/50 shadow-sm">
        <div className="flex items-center justify-center gap-3 py-10 text-sm text-text-muted">
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-orange-500/25 border-t-orange-500"
            aria-hidden
          />
          <span>{tc("loading")}</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border-border/50 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-xl bg-orange-500/10 p-2.5 text-orange-500 ring-1 ring-orange-500/20">
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
            lock_clock
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold tracking-tight">{t("modelLockouts")}</h3>
          <p className="text-sm text-text-muted">{t("lockoutsAutoRefreshHint")}</p>
        </div>
        {data.lockouts.length > 0 && (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">
            {t("lockedCount", { count: data.lockouts.length })}
          </span>
        )}
      </div>

      {data.lockouts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-bg-subtle/30 py-8 text-center text-text-muted">
          <span
            className="material-symbols-outlined mb-2 block text-[32px] opacity-40"
            aria-hidden="true"
          >
            lock_open
          </span>
          <p className="text-sm font-medium text-text-main">{t("noLockouts")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.lockouts.map((lock, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg
                           bg-orange-500/5 border border-orange-500/15"
            >
              <div className="flex items-center gap-3">
                <span
                  className="material-symbols-outlined text-[16px] text-orange-400"
                  aria-hidden="true"
                >
                  lock
                </span>
                <div>
                  <p className="text-sm font-medium">{lock.model}</p>
                  <p className="text-xs text-text-muted">
                    {t("account")}:{" "}
                    <span className="font-mono">{lock.accountId?.slice(0, 12) || tc("none")}</span>
                    {lock.reason && (
                      <>
                        {t("reasonSeparator")}
                        {lock.reason}
                      </>
                    )}
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono tabular-nums text-orange-400">
                {t("timeLeft", { time: formatMs(lock.remainingMs) })}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
