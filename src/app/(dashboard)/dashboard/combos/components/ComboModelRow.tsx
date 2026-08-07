"use client";

import Tooltip from "@/shared/components/Tooltip";
import { useTranslations } from "next-intl";
import type { ComboModelEntry } from "./combo-types";
import { getI18nOrFallback } from "./combo-utils";

interface ComboModelRowProps {
  entry: ComboModelEntry;
  index: number;
  total: number;
  strategy: string;
  displayName: string;
  /** Row-scoped test state, already resolved by the form from its row-id map. */
  isTesting: boolean;
  testStatus?: string;
  /** True when a template placed this row and classified it as a tier-C free-tier model. */
  limitedFreeTier: boolean;
  hasPricing: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: (event: React.DragEvent, index: number) => void;
  onDragEnd: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent, index: number) => void;
  onDrop: (event: React.DragEvent, index: number) => void;
  onToggleDisabled: (index: number) => void;
  onWeightChange: (index: number, value: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onTest: () => void;
  onRemove: (index: number) => void;
}

/**
 * One model row in the combo form's list. Purely presentational — every piece of state it
 * shows is resolved by the form and handed down, so the row never reads the row-id map.
 */
export function ComboModelRow({
  entry,
  index,
  total,
  strategy,
  displayName,
  isTesting,
  testStatus,
  limitedFreeTier,
  hasPricing,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onToggleDisabled,
  onWeightChange,
  onMoveUp,
  onMoveDown,
  onTest,
  onRemove,
}: ComboModelRowProps) {
  const t = useTranslations("combos");
  const testLabel = isTesting
    ? getI18nOrFallback(t, "testingModel", "Testing model...")
    : getI18nOrFallback(t, "testModel", "Test model");

  return (
    <div
      data-testid={`combo-model-row-${index}`}
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      className={`group/item flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-all cursor-grab active:cursor-grabbing ${
        isDropTarget
          ? "bg-primary/10 border border-primary/30"
          : "bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] border border-transparent"
      } ${isDragging ? "opacity-50" : ""} ${entry.disabled ? "opacity-50" : ""}`}
    >
      <button
        onClick={() => onToggleDisabled(index)}
        className={`shrink-0 w-8 h-4 rounded-full transition-all relative ${
          entry.disabled ? "bg-black/10 dark:bg-white/10" : "bg-primary"
        }`}
        title={entry.disabled ? "Enable model" : "Disable model"}
        aria-label={entry.disabled ? "Enable model" : "Disable model"}
      >
        <span
          className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-all ${
            entry.disabled ? "left-0.5" : "left-[18px]"
          }`}
        />
      </button>

      <span className="material-symbols-outlined text-[14px] text-text-muted/40 cursor-grab shrink-0">
        drag_indicator
      </span>

      <span className="text-[10px] font-medium text-text-muted w-3 text-center shrink-0">
        {index + 1}
      </span>

      <div
        className={`flex-1 min-w-0 px-1 text-xs truncate ${entry.disabled ? "text-text-muted line-through" : "text-text-main"}`}
      >
        {displayName}
      </div>

      {limitedFreeTier && (
        <Tooltip
          content={getI18nOrFallback(
            t,
            "templateLimitedFreeTierHint",
            "This provider's free tier has limits and may bill you if your key is on a paid plan."
          )}
        >
          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 whitespace-nowrap">
            {getI18nOrFallback(t, "templateLimitedFreeTierBadge", "Limited free tier")}
          </span>
        </Tooltip>
      )}

      {strategy === "cost-optimized" && (
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded-full uppercase font-semibold ${
            hasPricing
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          }`}
          title={
            hasPricing
              ? getI18nOrFallback(t, "pricingAvailable", "Pricing available")
              : getI18nOrFallback(t, "pricingMissing", "No pricing")
          }
        >
          {hasPricing
            ? getI18nOrFallback(t, "pricingAvailableShort", "priced")
            : getI18nOrFallback(t, "pricingMissingShort", "no-price")}
        </span>
      )}

      {strategy === "weighted" && (
        <div className="flex items-center gap-0.5 shrink-0">
          <input
            type="number"
            min="0"
            max="100"
            value={entry.weight}
            onChange={(e) => onWeightChange(index, e.target.value)}
            className="w-10 text-[11px] text-center py-0.5 rounded border border-black/10 dark:border-white/10 bg-transparent focus:border-primary focus:outline-none"
          />
          <span className="text-[10px] text-text-muted">%</span>
        </div>
      )}

      {strategy === "priority" && (
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onMoveUp(index)}
            disabled={index === 0}
            className={`p-0.5 rounded ${index === 0 ? "text-text-muted/20 cursor-not-allowed" : "text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"}`}
            aria-label={t("moveUp")}
            title={t("moveUp")}
          >
            <span className="material-symbols-outlined text-[12px]">arrow_upward</span>
          </button>
          <button
            onClick={() => onMoveDown(index)}
            disabled={index === total - 1}
            className={`p-0.5 rounded ${index === total - 1 ? "text-text-muted/20 cursor-not-allowed" : "text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"}`}
            aria-label={t("moveDown")}
            title={t("moveDown")}
          >
            <span className="material-symbols-outlined text-[12px]">arrow_downward</span>
          </button>
        </div>
      )}

      <button
        onClick={onTest}
        disabled={isTesting}
        aria-label={testLabel}
        className={`p-0.5 rounded transition-all ${
          testStatus === "ok"
            ? "text-emerald-500 hover:bg-emerald-500/10"
            : testStatus === "error"
              ? "text-red-500 hover:bg-red-500/10"
              : "text-text-muted hover:text-emerald-500 hover:bg-black/5 dark:hover:bg-white/5"
        } ${isTesting ? "cursor-not-allowed opacity-60" : ""}`}
        title={testLabel}
      >
        <span
          className={`material-symbols-outlined text-[12px] ${isTesting ? "animate-spin" : ""}`}
        >
          {isTesting
            ? "progress_activity"
            : testStatus === "ok"
              ? "check_circle"
              : testStatus === "error"
                ? "error"
                : "play_arrow"}
        </span>
      </button>

      <button
        onClick={() => onRemove(index)}
        aria-label={t("removeModel")}
        className="p-0.5 hover:bg-red-500/10 rounded text-text-muted hover:text-red-500 transition-all"
        title={t("removeModel")}
      >
        <span className="material-symbols-outlined text-[12px]">close</span>
      </button>
    </div>
  );
}
