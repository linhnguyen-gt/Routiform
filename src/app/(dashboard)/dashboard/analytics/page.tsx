"use client";

import { useState, Suspense } from "react";
import { UsageAnalytics, CardSkeleton, SegmentedControl } from "@/shared/components";
import EvalsTab from "../usage/components/EvalsTab";
import SearchAnalyticsTab from "./SearchAnalyticsTab";
import DiversityScoreCard from "./components/DiversityScoreCard";
import ProviderUtilizationTab from "./ProviderUtilizationTab";
import ComboHealthTab from "./ComboHealthTab";
import { useTranslations } from "next-intl";

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState("overview");
  /** Shared with UsageAnalytics + Provider Diversity so both use the same usage DB window. */
  const [usageRange, setUsageRange] = useState("30d");
  const t = useTranslations("analytics");

  const tabDescriptions: Record<string, string> = {
    overview: t("overviewDescription"),
    evals: t("evalsDescription"),
    search: "Search request analytics — provider breakdown, cache hit rate, and cost tracking.",
    utilization: t("utilizationDescription"),
    comboHealth: t("comboHealthDescription"),
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Page Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <span className="material-symbols-outlined text-primary text-[28px]" aria-hidden>
            analytics
          </span>
          {t("title")}
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-text-muted">
          {tabDescriptions[activeTab]}
        </p>
      </div>

      <SegmentedControl
        options={[
          { value: "overview", label: t("overview") },
          { value: "evals", label: t("evals") },
          { value: "search", label: "Search" },
          { value: "utilization", label: t("utilization") },
          { value: "comboHealth", label: t("comboHealth") },
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "overview" && (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] xl:items-start">
          <Suspense fallback={<CardSkeleton />}>
            <UsageAnalytics range={usageRange} onRangeChange={setUsageRange} />
          </Suspense>
          <aside className="xl:sticky xl:top-4 xl:self-start">
            <DiversityScoreCard usageRange={usageRange} />
          </aside>
        </div>
      )}
      {activeTab === "evals" && <EvalsTab />}
      {activeTab === "search" && <SearchAnalyticsTab />}
      {activeTab === "utilization" && <ProviderUtilizationTab />}
      {activeTab === "comboHealth" && <ComboHealthTab />}
    </div>
  );
}
