"use client";

import { useEffect, useRef } from "react";
import {
  isModelEffort,
  MODEL_EFFORT_OPTIONS,
  type ModelEffort,
} from "@/shared/constants/reasoning-effort";

const UNSET = "";

export interface ModelEffortSelectProps {
  /** An effort, or anything else to mean "not set" — rendered as the inherit placeholder. */
  value: string | undefined;
  onChange: (effort: ModelEffort) => void;
  /** Model this effort belongs to — used for the accessible label. */
  modelValue: string;
  /** Layout classes, typically the corner rounding for the chip group it sits in. */
  className?: string;
  /** Colors, replaced wholesale by hosts with their own chip palette. */
  colorClass?: string;
  /** The last write failed: the value has already reverted, so say why. */
  error?: boolean;
  disabled?: boolean;
  /**
   * Mount focused, with the dropdown already open where the browser allows it. For hosts
   * that mount this on demand, so the click that summoned it still opens the list.
   */
  autoOpen?: boolean;
  /** A value was chosen or focus left — the host may unmount the control again. */
  onDismiss?: () => void;
}

/**
 * Compact reasoning-effort dropdown rendered inside a model chip. Kept separate so the
 * picker and the model-defaults list share one control instead of two lookalikes.
 *
 * A value that is not a known effort renders a disabled "inherit" placeholder, so an
 * unconfigured model never looks like it already carries an explicit effort.
 */
export default function ModelEffortSelect({
  value,
  onChange,
  modelValue,
  className = "",
  colorClass = "bg-surface text-text-muted border-border hover:border-primary/50 hover:text-primary",
  error = false,
  disabled = false,
  autoOpen = false,
  onDismiss,
}: ModelEffortSelectProps) {
  const selected = isModelEffort(value) ? value : UNSET;
  const label = error
    ? `Failed to save reasoning effort for ${modelValue}`
    : `Reasoning effort for ${modelValue}`;

  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (!autoOpen) return;
    const element = ref.current;
    if (!element || element.disabled) return;
    element.focus();
    try {
      // Chrome/Edge only. Elsewhere the control is merely focused and opens on the
      // next click, which is the same interaction an always-mounted select would need.
      element.showPicker?.();
    } catch {
      // Transient user activation expired; focus is enough.
    }
  }, [autoOpen]);

  return (
    <select
      ref={ref}
      value={selected}
      disabled={disabled}
      onChange={(e) => {
        if (isModelEffort(e.target.value)) onChange(e.target.value);
        onDismiss?.();
      }}
      onBlur={() => onDismiss?.()}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      aria-invalid={error || undefined}
      title={label}
      className={`
        px-1.5 py-1 text-[10px] font-medium border focus:outline-none
        focus:ring-1 focus:ring-primary/50 transition-all
        ${error ? "border-red-500/60 text-red-500 bg-red-500/10" : colorClass}
        ${disabled ? "opacity-60 cursor-not-allowed" : "hover:cursor-pointer"}
        ${className}
      `}
    >
      {selected === UNSET && (
        <option value={UNSET} disabled>
          inherit
        </option>
      )}
      {MODEL_EFFORT_OPTIONS.map((effort) => (
        <option key={effort} value={effort}>
          {effort}
        </option>
      ))}
    </select>
  );
}
