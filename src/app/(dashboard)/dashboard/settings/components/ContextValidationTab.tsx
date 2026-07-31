"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "@/shared/components";
import { useTranslations } from "next-intl";
import CompressionPresetCard, { SELECTABLE_PRESETS } from "./CompressionPresetCard";
import type { CompressionPreset } from "./CompressionPresetCard";

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
  const [preset, setPreset] = useState<CompressionPreset | null>(null);
  const [presetSaving, setPresetSaving] = useState(false);
  const [presetStatus, setPresetStatus] = useState<"" | "saved" | "error">("");
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
          // An absent preset shows as `balanced` because that is what the server resolves it
          // to — showing "off", or nothing, would misreport what the install is actually doing.
          const presetValue = data?.compressionPreset;
          if (SELECTABLE_PRESETS.includes(presetValue)) {
            setPreset(presetValue);
          } else if (preset === null) {
            setPreset("balanced");
          }
          setTimeout(poll, 500);
        })
        .catch(() => {
          if (cancelled) return;
          if (attempts >= maxAttempts) {
            if (mode === null) setMode("passthrough");
            if (cavemanLevel === null) setCavemanLevel("off");
            if (preset === null) setPreset("balanced");
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
  }, [mode, cavemanLevel, preset, savingRef]);

  /**
   * PATCH one settings field and drive its own saving/status pair.
   *
   * Extracted when a third field arrived: the two existing handlers were byte-identical apart
   * from the field name and which state they set, and a third copy is where the drift starts.
   * `savingRef` stays shared — it pauses the poll loop for every field, not per field, so
   * saving one setting cannot be clobbered by a poll answering for another.
   */
  const patchSetting = async (
    patch: Record<string, unknown>,
    setFieldSaving: (value: boolean) => void,
    setFieldStatus: (value: "" | "saved" | "error") => void
  ) => {
    savingRef.current = true;
    setFieldSaving(true);
    setFieldStatus("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed");
      setFieldStatus("saved");
      setTimeout(() => setFieldStatus(""), 2000);
    } catch {
      setFieldStatus("error");
    } finally {
      setFieldSaving(false);
      setTimeout(() => {
        savingRef.current = false;
      }, 2000);
    }
  };

  const handleSave = (newMode: ContextValidationMode) => {
    setMode(newMode);
    return patchSetting({ contextValidation: newMode }, setSaving, setStatus);
  };

  const handleSaveCavemanLevel = (newLevel: CavemanOutputLevel) => {
    setCavemanLevel(newLevel);
    return patchSetting({ cavemanOutputLevel: newLevel }, setCavemanSaving, setCavemanStatus);
  };

  const handleSavePreset = (newPreset: CompressionPreset) => {
    setPreset(newPreset);
    return patchSetting({ compressionPreset: newPreset }, setPresetSaving, setPresetStatus);
  };

  const resolvedMode = mode ?? "passthrough";
  const noSelectionYet = mode === null;
  const resolvedCavemanLevel = cavemanLevel ?? "off";
  const noCavemanSelectionYet = cavemanLevel === null;
  const resolvedPreset = preset ?? "balanced";

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

      <CompressionPresetCard
        t={t}
        resolvedPreset={resolvedPreset}
        disabled={resolvedMode !== "auto-compress"}
        loading={loading}
        saving={presetSaving}
        status={presetStatus}
        onSave={handleSavePreset}
      />

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
