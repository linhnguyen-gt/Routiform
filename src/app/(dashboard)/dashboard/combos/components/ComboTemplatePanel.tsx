"use client";

import { useTranslations } from "next-intl";
import { COMBO_TEMPLATE_FALLBACK, COMBO_TEMPLATES } from "./combo-constants";
import type { ComboTemplate, TemplateResolution } from "./combo-template-types";
import { getI18nOrFallback } from "./combo-utils";

const REASON_FALLBACKS: Record<string, string> = {
  templateNeedsAnyProvider: "Connect at least one provider to use templates.",
  templateNeedsProviders: "Connect {providers} to use this template.",
  templateNeedsPricing: "No connected model has pricing data, so cost ranking is unavailable.",
  templateProviderNoModels:
    "{providers} is connected but returned no models. Check the provider's status, then try again.",
};

interface ComboTemplatePanelProps {
  resolutions: Record<string, TemplateResolution>;
  onApply: (template: ComboTemplate, resolution: TemplateResolution) => void;
}

/**
 * Presentational only — it receives every template's resolution up front and renders the
 * grid. Resolving lazily on click would leave an unsatisfiable button enabled until the
 * user discovered otherwise.
 *
 * Unsatisfiable templates use `aria-disabled` rather than the `disabled` attribute so the
 * button stays keyboard-focusable and its reason stays reachable to a screen reader.
 */
export function ComboTemplatePanel({ resolutions, onApply }: ComboTemplatePanelProps) {
  const t = useTranslations("combos");

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
      {COMBO_TEMPLATES.map((template) => {
        const resolution = resolutions[template.id];
        const unavailable = !resolution || !resolution.ok;
        const reasonId = `combo-template-reason-${template.id}`;
        const reason =
          resolution && !resolution.ok
            ? getI18nOrFallback(
                t,
                resolution.reasonKey,
                REASON_FALLBACKS[resolution.reasonKey] ?? "Not available yet",
                resolution.reasonParams
              )
            : "";

        return (
          <button
            type="button"
            key={template.id}
            aria-disabled={unavailable}
            aria-describedby={unavailable ? reasonId : undefined}
            data-template-id={template.id}
            onClick={() => {
              if (unavailable || !resolution) return;
              onApply(template, resolution);
            }}
            className={`w-full text-left rounded-md border px-3 py-2 transition-all border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.03] ${
              unavailable
                ? "opacity-50 cursor-not-allowed"
                : "hover:border-primary/40 hover:bg-primary/5"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-primary">
                {template.icon}
              </span>
              <span className="text-[12px] font-semibold text-text-main">
                {getI18nOrFallback(t, template.titleKey, template.fallbackTitle)}
              </span>
            </div>
            <p className="text-[10px] text-text-muted mt-1.5 leading-[1.5]">
              {getI18nOrFallback(t, template.descKey, template.fallbackDesc)}
            </p>
            {unavailable ? (
              <p
                id={reasonId}
                className="text-[10px] mt-1.5 font-medium text-amber-600 dark:text-amber-400 leading-[1.5]"
              >
                {getI18nOrFallback(t, "templateUnavailable", "Not available yet")} — {reason}
              </p>
            ) : (
              <p className="text-[10px] mt-1.5 font-medium text-primary">
                {getI18nOrFallback(t, "templateApply", COMBO_TEMPLATE_FALLBACK.apply)} →
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
