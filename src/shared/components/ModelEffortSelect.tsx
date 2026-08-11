"use client";

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
}: ModelEffortSelectProps) {
  const selected = isModelEffort(value) ? value : UNSET;
  const label = error
    ? `Failed to save reasoning effort for ${modelValue}`
    : `Reasoning effort for ${modelValue}`;

  return (
    <select
      value={selected}
      disabled={disabled}
      onChange={(e) => {
        if (isModelEffort(e.target.value)) onChange(e.target.value);
      }}
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
