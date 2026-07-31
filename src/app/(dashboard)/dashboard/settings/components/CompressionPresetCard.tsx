"use client";

import { Card } from "@/shared/components";
import { useTranslations } from "next-intl";

/**
 * Which compression engines run.
 *
 * `custom` is deliberately absent from this picker. It is a valid stored value and the API
 * accepts it, but it means "run exactly the engines listed in `compressionEngines`" — and with
 * no per-engine toggle UI yet, offering the button would let someone select it and silently turn
 * all compression off. A control that does the opposite of what its label suggests is worse than
 * a control that is not there.
 */
export type CompressionPreset = "off" | "safe" | "balanced" | "aggressive";

export const SELECTABLE_PRESETS: CompressionPreset[] = ["off", "safe", "balanced", "aggressive"];

const PRESET_ICONS: Record<CompressionPreset, string> = {
  off: "toggle_off",
  safe: "verified",
  balanced: "balance",
  aggressive: "compress",
};

const PRESET_LABEL_KEYS: Record<CompressionPreset, string> = {
  off: "compressionPresetOff",
  safe: "compressionPresetSafe",
  balanced: "compressionPresetBalanced",
  aggressive: "compressionPresetAggressive",
};

const PRESET_DESC_KEYS: Record<CompressionPreset, string> = {
  off: "compressionPresetOffDesc",
  safe: "compressionPresetSafeDesc",
  balanced: "compressionPresetBalancedDesc",
  aggressive: "compressionPresetAggressiveDesc",
};

export default function CompressionPresetCard({
  t,
  resolvedPreset,
  disabled,
  loading,
  saving,
  status,
  onSave,
}: {
  t: ReturnType<typeof useTranslations>;
  resolvedPreset: CompressionPreset;
  /** True when compression itself is switched off, which makes the preset moot. */
  disabled: boolean;
  loading: boolean;
  saving: boolean;
  status: "" | "saved" | "error";
  onSave: (preset: CompressionPreset) => void;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
            tune
          </span>
        </div>
        <div>
          <h3 className="text-lg font-semibold">{t("compressionPresetTitle")}</h3>
          <p className="text-sm text-text-muted">{t("compressionPresetDesc")}</p>
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

      {disabled && (
        <p className="mb-3 text-xs text-text-muted">{t("compressionPresetRequiresAutoCompress")}</p>
      )}

      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 ${disabled ? "opacity-50" : ""}`}>
        {SELECTABLE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onSave(preset)}
            disabled={loading || saving || disabled}
            className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
              resolvedPreset === preset
                ? "border-violet-500/50 bg-violet-500/5 ring-1 ring-violet-500/20"
                : "border-border/50 hover:border-border hover:bg-surface/30"
            }`}
          >
            <span
              className={`material-symbols-outlined text-[20px] mt-0.5 ${
                resolvedPreset === preset
                  ? "text-violet-600 dark:text-violet-400"
                  : "text-text-muted"
              }`}
              aria-hidden
            >
              {PRESET_ICONS[preset]}
            </span>
            <span>
              <span className="block text-sm font-medium text-text-main">
                {t(PRESET_LABEL_KEYS[preset])}
              </span>
              <span className="block text-xs text-text-muted mt-1">
                {t(PRESET_DESC_KEYS[preset])}
              </span>
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}
