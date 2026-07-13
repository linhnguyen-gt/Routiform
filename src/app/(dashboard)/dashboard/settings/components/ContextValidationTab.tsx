"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "@/shared/components";
import { useTranslations } from "next-intl";

type ContextValidationMode = "passthrough" | "auto-compress";
type CavemanOutputLevel = "off" | "lite" | "full";

const CAVEMAN_OUTPUT_LEVELS: CavemanOutputLevel[] = ["off", "lite", "full"];

export default function ContextValidationTab() {
  const t = useTranslations("settings");
  const [mode, setMode] = useState<ContextValidationMode | null>(null);
  const [cavemanLevel, setCavemanLevel] = useState<CavemanOutputLevel | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"" | "saved" | "error">("");
  const [cavemanSaving, setCavemanSaving] = useState(false);
  const [cavemanStatus, setCavemanStatus] = useState<"" | "saved" | "error">("");
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 3;

    const poll = () => {
      if (cancelled || savingRef.current) {
        setTimeout(poll, 500);
        return;
      }
      attempts++;
      fetch("/api/settings", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled) return;
          const value = data?.contextValidation;
          if (value === "passthrough" || value === "auto-compress") {
            setMode(value);
            setLoading(false);
            attempts = 0;
          } else if (mode === null) {
            setMode("passthrough");
            setLoading(false);
          }
          const cavemanValue = data?.cavemanOutputLevel;
          if (CAVEMAN_OUTPUT_LEVELS.includes(cavemanValue)) {
            setCavemanLevel(cavemanValue);
          } else if (cavemanLevel === null) {
            setCavemanLevel("off");
          }
          setTimeout(poll, 500);
        })
        .catch(() => {
          if (cancelled) return;
          if (attempts >= maxAttempts) {
            if (mode === null) setMode("passthrough");
            if (cavemanLevel === null) setCavemanLevel("off");
            setLoading(false);
            setStatus("error");
          } else {
            setTimeout(poll, 500);
          }
        });
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [mode, cavemanLevel, savingRef]);

  const handleSave = async (newMode: ContextValidationMode) => {
    savingRef.current = true;
    setMode(newMode);
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contextValidation: newMode }),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus("saved");
      setTimeout(() => setStatus(""), 2000);
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
      setTimeout(() => {
        savingRef.current = false;
      }, 2000);
    }
  };

  const handleSaveCavemanLevel = async (newLevel: CavemanOutputLevel) => {
    savingRef.current = true;
    setCavemanLevel(newLevel);
    setCavemanSaving(true);
    setCavemanStatus("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cavemanOutputLevel: newLevel }),
      });
      if (!res.ok) throw new Error("Failed");
      setCavemanStatus("saved");
      setTimeout(() => setCavemanStatus(""), 2000);
    } catch {
      setCavemanStatus("error");
    } finally {
      setCavemanSaving(false);
      setTimeout(() => {
        savingRef.current = false;
      }, 2000);
    }
  };

  const resolvedMode = mode ?? "passthrough";
  const noSelectionYet = mode === null;
  const resolvedCavemanLevel = cavemanLevel ?? "off";
  const noCavemanSelectionYet = cavemanLevel === null;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              compress
            </span>
          </div>
          <div>
            <h3 className="text-lg font-semibold">{t("contextValidationTitle")}</h3>
            <p className="text-sm text-text-muted">{t("contextValidationDesc")}</p>
          </div>
          {status === "saved" && (
            <span className="ml-auto text-xs font-medium text-emerald-500 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">check_circle</span>{" "}
              {t("saved")}
            </span>
          )}
          {status === "error" && (
            <span className="ml-auto text-xs font-medium text-red-500">{t("errorOccurred")}</span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleSave("passthrough")}
            disabled={loading || saving || noSelectionYet}
            className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
              !noSelectionYet && resolvedMode === "passthrough"
                ? "border-sky-500/50 bg-sky-500/5 ring-1 ring-sky-500/20"
                : "border-border/50 hover:border-border hover:bg-surface/30"
            }`}
          >
            <span
              className={`material-symbols-outlined text-[20px] mt-0.5 ${
                !noSelectionYet && resolvedMode === "passthrough"
                  ? "text-sky-600 dark:text-sky-400"
                  : "text-text-muted"
              }`}
              aria-hidden
            >
              unfold_more
            </span>
            <span>
              <span className="block text-sm font-medium text-text-main">
                {t("contextValidationPassthrough")}
              </span>
              <span className="block text-xs text-text-muted mt-1">
                {t("contextValidationPassthroughDesc")}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSave("auto-compress")}
            disabled={loading || saving || noSelectionYet}
            className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
              !noSelectionYet && resolvedMode === "auto-compress"
                ? "border-sky-500/50 bg-sky-500/5 ring-1 ring-sky-500/20"
                : "border-border/50 hover:border-border hover:bg-surface/30"
            }`}
          >
            <span
              className={`material-symbols-outlined text-[20px] mt-0.5 ${
                !noSelectionYet && resolvedMode === "auto-compress"
                  ? "text-sky-600 dark:text-sky-400"
                  : "text-text-muted"
              }`}
              aria-hidden
            >
              auto_fix_high
            </span>
            <span>
              <span className="block text-sm font-medium text-text-main">
                {t("contextValidationAutoCompress")}
              </span>
              <span className="block text-xs text-text-muted mt-1">
                {t("contextValidationAutoCompressDesc")}
              </span>
            </span>
          </button>
        </div>
      </Card>

      <CavemanOutputCard
        t={t}
        resolvedLevel={resolvedCavemanLevel}
        noSelectionYet={noCavemanSelectionYet}
        loading={loading}
        saving={cavemanSaving}
        status={cavemanStatus}
        onSave={handleSaveCavemanLevel}
      />
    </div>
  );
}

const CAVEMAN_LEVEL_ICONS: Record<CavemanOutputLevel, string> = {
  off: "toggle_off",
  lite: "compress",
  full: "density_small",
};

const CAVEMAN_LEVEL_LABEL_KEYS: Record<CavemanOutputLevel, string> = {
  off: "cavemanOutputOff",
  lite: "cavemanOutputLite",
  full: "cavemanOutputFull",
};

const CAVEMAN_LEVEL_DESC_KEYS: Record<CavemanOutputLevel, string> = {
  off: "cavemanOutputOffDesc",
  lite: "cavemanOutputLiteDesc",
  full: "cavemanOutputFullDesc",
};

function CavemanOutputCard({
  t,
  resolvedLevel,
  noSelectionYet,
  loading,
  saving,
  status,
  onSave,
}: {
  t: ReturnType<typeof useTranslations>;
  resolvedLevel: CavemanOutputLevel;
  noSelectionYet: boolean;
  loading: boolean;
  saving: boolean;
  status: "" | "saved" | "error";
  onSave: (level: CavemanOutputLevel) => void;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
            short_text
          </span>
        </div>
        <div>
          <h3 className="text-lg font-semibold">{t("cavemanOutputTitle")}</h3>
          <p className="text-sm text-text-muted">{t("cavemanOutputDesc")}</p>
        </div>
        {status === "saved" && (
          <span className="ml-auto text-xs font-medium text-emerald-500 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">check_circle</span> {t("saved")}
          </span>
        )}
        {status === "error" && (
          <span className="ml-auto text-xs font-medium text-red-500">{t("errorOccurred")}</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {CAVEMAN_OUTPUT_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onSave(level)}
            disabled={loading || saving || noSelectionYet}
            className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
              !noSelectionYet && resolvedLevel === level
                ? "border-amber-500/50 bg-amber-500/5 ring-1 ring-amber-500/20"
                : "border-border/50 hover:border-border hover:bg-surface/30"
            }`}
          >
            <span
              className={`material-symbols-outlined text-[20px] mt-0.5 ${
                !noSelectionYet && resolvedLevel === level
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-text-muted"
              }`}
              aria-hidden
            >
              {CAVEMAN_LEVEL_ICONS[level]}
            </span>
            <span>
              <span className="block text-sm font-medium text-text-main">
                {t(CAVEMAN_LEVEL_LABEL_KEYS[level])}
              </span>
              <span className="block text-xs text-text-muted mt-1">
                {t(CAVEMAN_LEVEL_DESC_KEYS[level])}
              </span>
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}
