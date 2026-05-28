"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useVisiblePolling } from "@/shared/hooks/useVisiblePolling";

const DEGRADATION_POLL_INTERVAL_MS = 120_000;

export default function DegradationBadge() {
  const [isDegraded, setDegraded] = useState(false);
  const t = useTranslations("common"); // Or a specific namespace if needed

  const checkDegradation = async () => {
    try {
      const res = await fetch("/api/health/degradation?summary=true");
      if (res.ok) {
        const data = await res.json();
        setDegraded(data.isDegraded);
      }
    } catch (_err) {
      // Ignore error
    }
  };

  useVisiblePolling(checkDegradation, { intervalMs: DEGRADATION_POLL_INTERVAL_MS });

  if (!isDegraded) return null;

  return (
    <Link
      href="/dashboard/health"
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors border border-amber-500/20"
      title={t("warning")} // Using common warning text, or we could just use English / fixed string if i18n is not strict
    >
      <span className="material-symbols-outlined text-[16px]">healing</span>
      <span className="text-xs font-semibold whitespace-nowrap">Degraded</span>
    </Link>
  );
}
