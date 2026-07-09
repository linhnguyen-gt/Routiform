"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  FREE_TIER_CATALOG,
  summarizeFreeTierCatalog,
  type FreeTierKind,
} from "@/shared/constants/freeTierCatalog";

const KIND_LABEL: Record<FreeTierKind, string> = {
  forever: "Free forever",
  "signup-credit": "Signup credit",
  daily: "Daily pool",
  "rate-limited": "Rate-limited free",
  "oauth-sub": "Subscription OAuth",
};

const KIND_CLASS: Record<FreeTierKind, string> = {
  forever: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "signup-credit": "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  daily: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  "rate-limited": "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  "oauth-sub": "bg-slate-500/15 text-slate-600 dark:text-slate-300",
};

function formatTokens(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export default function FreeTiersPage() {
  const [filter, setFilter] = useState<"all" | FreeTierKind>("all");
  const summary = useMemo(() => summarizeFreeTierCatalog(), []);
  const rows = useMemo(() => {
    if (filter === "all") return FREE_TIER_CATALOG;
    return FREE_TIER_CATALOG.filter((e) => e.kind === filter);
  }, [filter]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-8">
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-surface via-surface to-bg-subtle/40 p-6 shadow-sm ring-1 ring-black/[0.03] dark:to-white/[0.03] dark:ring-white/[0.06] sm:p-7">
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/10 blur-3xl"
          aria-hidden
        />
        <div className="relative">
          <h1 className="text-2xl font-semibold tracking-tight text-text-main">Free tiers</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-muted">
            Documented free / freemium surfaces for providers already in your catalog. Static notes
            only — not live remaining quota. Terms change; verify with each provider.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">Catalog entries</p>
          <p className="mt-1 text-2xl font-semibold text-text-main">{summary.total}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">Free forever</p>
          <p className="mt-1 text-2xl font-semibold text-text-main">{summary.forever}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">Known monthly tokens*</p>
          <p className="mt-1 text-2xl font-semibold text-text-main">
            {formatTokens(summary.approxKnownMonthlyTokens)}
          </p>
          <p className="mt-1 text-[11px] text-text-muted">*Only entries with published estimates</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "forever", "signup-credit", "daily", "rate-limited", "oauth-sub"] as const).map(
          (k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === k
                  ? "bg-primary text-white"
                  : "bg-sidebar text-text-muted hover:text-text-main"
              }`}
            >
              {k === "all" ? "All" : KIND_LABEL[k]}
            </button>
          )
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border/60 bg-sidebar/40 text-xs uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Provider</th>
              <th className="px-4 py-3 font-medium">Kind</th>
              <th className="px-4 py-3 font-medium">Summary</th>
              <th className="px-4 py-3 font-medium">~Tokens/mo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.providerId} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-3 align-top">
                  <Link
                    href={`/dashboard/providers/${row.providerId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {row.name}
                  </Link>
                  <div className="font-mono text-[11px] text-text-muted">{row.providerId}</div>
                </td>
                <td className="px-4 py-3 align-top">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${KIND_CLASS[row.kind]}`}
                  >
                    {KIND_LABEL[row.kind]}
                  </span>
                </td>
                <td className="px-4 py-3 align-top text-text-muted">
                  {row.summary}
                  {row.notes ? (
                    <div className="mt-1 text-[11px] opacity-80">{row.notes}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3 align-top font-mono text-xs text-text-main">
                  {formatTokens(row.approxTokensPerMonth)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
