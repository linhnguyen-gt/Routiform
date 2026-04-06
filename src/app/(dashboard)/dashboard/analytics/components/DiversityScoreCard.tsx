"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card } from "@/shared/components";
import { fmtFull } from "@/shared/utils/formatting";
import { computeNormalizedEntropyFromByProvider } from "@/shared/utils/providerDiversityFromUsage";

type UsageAnalyticsPayload = {
  byProvider?: Array<{
    provider?: string;
    requests?: number;
    totalRequests?: number;
    apiCalls?: number;
  }>;
};

function rangeLabelKey(range: string): string {
  switch (range) {
    case "1d":
      return "diversityUsageRange1d";
    case "7d":
      return "diversityUsageRange7d";
    case "30d":
      return "diversityUsageRange30d";
    case "90d":
      return "diversityUsageRange90d";
    case "ytd":
      return "diversityUsageRangeYtd";
    case "all":
      return "diversityUsageRangeAll";
    default:
      return "diversityUsageRange30d";
  }
}

export default function DiversityScoreCard({ usageRange }: { usageRange: string }) {
  const t = useTranslations("analytics");
  const [score01, setScore01] = useState(0);
  const [providers, setProviders] = useState<Record<string, { share: number }>>({});
  const [totalRequests, setTotalRequests] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/usage/analytics?range=${encodeURIComponent(usageRange)}`);
      if (!res.ok) {
        throw new Error(`usage analytics ${res.status}`);
      }
      const json = (await res.json()) as UsageAnalyticsPayload;
      const computed = computeNormalizedEntropyFromByProvider(json?.byProvider);
      setScore01(computed.score01);
      setProviders(computed.providers);
      setTotalRequests(computed.totalRequests);
    } catch (err) {
      console.error(err);
      setScore01(0);
      setProviders({});
      setTotalRequests(0);
      setError(t("diversityLoadError"));
    } finally {
      setLoading(false);
    }
  }, [t, usageRange]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Card className="flex min-h-[240px] flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-1 items-center gap-2">
            <div className="h-6 w-6 animate-pulse rounded-lg bg-surface/50" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-44 animate-pulse rounded bg-surface/50" />
              <div className="h-3 w-full max-w-md animate-pulse rounded bg-surface/40" />
            </div>
          </div>
          <div className="h-6 w-24 animate-pulse rounded-full bg-surface/40" />
        </div>
        <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center">
          <div className="mx-auto h-28 w-28 shrink-0 animate-pulse rounded-full bg-surface/40" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-surface/40" />
            <div className="h-3 w-full animate-pulse rounded bg-surface/40" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-surface/40" />
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="flex min-h-[200px] flex-col gap-4 p-5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-primary">pie_chart</span>
          <h3 className="font-semibold text-text-main">{t("diversityCardTitle")}</h3>
        </div>
        <p className="text-sm text-text-muted">{error}</p>
        <Button variant="secondary" size="sm" className="w-fit" onClick={() => void load()}>
          {t("diversityRetry")}
        </Button>
      </Card>
    );
  }

  const hasBreakdown = totalRequests > 0;
  const scorePercentage = Math.round(score01 * 100);
  const periodLabel = t(rangeLabelKey(usageRange));

  let riskColor = "text-green-500";
  let gaugeColor = "bg-green-500";
  let riskLabel = t("diversityHealthy");

  if (!hasBreakdown) {
    riskColor = "text-text-muted";
    gaugeColor = "bg-text-muted";
    riskLabel = t("diversityNoMix");
  } else if (scorePercentage < 40) {
    riskColor = "text-red-500";
    gaugeColor = "bg-red-500";
    riskLabel = t("diversityRiskHigh");
  } else if (scorePercentage < 70) {
    riskColor = "text-amber-500";
    gaugeColor = "bg-amber-500";
    riskLabel = t("diversityRiskModerate");
  }

  const linkClass =
    "inline-flex h-8 items-center rounded-md border border-black/15 px-3 text-xs font-medium text-text-main transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5";

  return (
    <Card className="flex flex-col gap-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">pie_chart</span>
            <h3 className="font-semibold text-text-main">{t("diversityCardTitle")}</h3>
          </div>
          <p className="mt-1 text-sm text-text-muted">{t("diversityCardSubtitle")}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            !hasBreakdown
              ? "bg-surface/80 text-text-muted"
              : scorePercentage < 40
                ? "bg-red-500/10 text-red-500"
                : scorePercentage < 70
                  ? "bg-amber-500/10 text-amber-500"
                  : "bg-green-500/10 text-green-500"
          }`}
        >
          {t("diversityMethodBadge")}
        </span>
      </div>

      {!hasBreakdown ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="mx-auto flex h-32 w-32 shrink-0 items-center justify-center rounded-2xl border border-dashed border-border/50 bg-surface/20 sm:mx-0">
            <span className="material-symbols-outlined text-5xl text-text-muted/35">hub</span>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <h4 className="font-medium text-text-main">{t("diversityEmptyTitle")}</h4>
            <p className="text-sm leading-relaxed text-text-muted">{t("diversityEmptyIntro")}</p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-text-muted">
              <li>{t("diversityEmptyTip1")}</li>
              <li>{t("diversityEmptyTip2")}</li>
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/dashboard/providers" className={linkClass}>
                {t("diversityOpenProviders")}
              </Link>
              <Link href="/dashboard/combos" className={linkClass}>
                {t("diversityOpenCombos")}
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[112px_minmax(0,1fr)] sm:items-center">
          <div className="relative mx-auto h-28 w-28">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-border/70"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className={riskColor}
                strokeWidth="3.5"
                strokeDasharray={`${scorePercentage}, 100`}
                stroke="currentColor"
                fill="none"
                strokeLinecap="round"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-2xl font-semibold tabular-nums ${riskColor}`}>
                {scorePercentage}%
              </span>
              <span className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                {t("diversityScoreLabel")}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-border/30 bg-surface/20 px-4 py-3">
              <div className={`text-sm font-medium ${riskColor}`}>{riskLabel}</div>
              <div className="mt-1 text-xs text-text-muted">{t("diversityExplainHigh")}</div>
            </div>

            <div className="space-y-3">
              {Object.entries(providers)
                .sort(([, a], [, b]) => b.share - a.share)
                .slice(0, 8)
                .map(([provider, stat]) => (
                  <div key={provider} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium capitalize text-text-main">{provider}</span>
                      <span className="tabular-nums text-text-muted">
                        {Math.round(stat.share * 100)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface/50">
                      <div
                        className={`h-full rounded-full ${gaugeColor}`}
                        style={{ width: `${Math.round(stat.share * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 border-t border-border/30 pt-4 text-xs text-text-muted">
        <div className="rounded-lg bg-surface/20 px-3 py-2">
          {t("diversityFooterUsageRange", { label: periodLabel })}
        </div>
        <div className="rounded-lg bg-surface/20 px-3 py-2 text-right">
          {t("diversityFooterTotalRequests", { count: fmtFull(totalRequests) })}
        </div>
      </div>
    </Card>
  );
}
