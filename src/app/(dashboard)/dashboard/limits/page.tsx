"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { CardSkeleton } from "@/shared/components";
import ProviderLimits from "../usage/components/ProviderLimits";
import RateLimitStatus from "../usage/components/RateLimitStatus";
import SessionsTab from "../usage/components/SessionsTab";

export default function LimitsPage() {
  const tl = useTranslations("limits");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-8">
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-surface via-surface to-bg-subtle/40 p-6 shadow-sm ring-1 ring-black/[0.03] dark:to-white/[0.03] dark:ring-white/[0.06] sm:p-7">
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/10 blur-3xl"
          aria-hidden
        />
        <div className="relative">
          <h1 className="text-2xl font-semibold tracking-tight text-text-main">{tl("title")}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-muted">{tl("pageDescription")}</p>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <Suspense fallback={<CardSkeleton />}>
          <ProviderLimits />
        </Suspense>
        <SessionsTab />
        <RateLimitStatus />
      </div>
    </div>
  );
}
