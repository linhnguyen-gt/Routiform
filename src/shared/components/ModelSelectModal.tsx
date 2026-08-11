"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import Modal from "./Modal";
import Button from "./Button";
import type { AvailableModel, AvailableModelGroup } from "@/shared/models/available-models";
import type { ProviderConnection } from "@/shared/models/provider-connection";
import { useAvailableModels, type ComboSummary } from "@/shared/models/use-available-models";
import { useModelEffortDefaults } from "@/shared/models/use-model-effort-defaults";
import type { ModelEffort } from "@/shared/constants/reasoning-effort";
import ModelEffortSelect from "./ModelEffortSelect";

/**
 * What `onSelect` receives: either an `AvailableModel` from a provider group or a
 * synthetic entry for a combo. No index signature — `AvailableModel` does not carry
 * one, and requiring it would make the real model type unassignable here.
 */
export interface ModelItem {
  id?: unknown;
  name?: unknown;
  value?: unknown;
  isCustom?: boolean;
}

/**
 * Stable empty defaults. A fresh `{}` per render feeds `useAvailableModels`' memo deps and
 * re-derives the whole catalog on every keystroke for any caller that omits the prop.
 */
const NO_ALIASES: Record<string, string> = {};
const EMPTY_EFFORTS: Record<string, string> = {};

export interface ModelSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (model: ModelItem) => void;
  selectedModel?: string | null;
  activeProviders?: ProviderConnection[];
  title?: string;
  modelAliases?: Record<string, string>;
  addedModelValues?: string[];
  multiSelect?: boolean;
  /**
   * Per-model test button. Defaults to ON: every picker offers the same controls unless a
   * call site deliberately opts out, which is what kept the CLI tool cards a feature behind.
   */
  enableModelTest?: boolean;
  /**
   * When supplied, the data hook is NOT called. A parent that already derives the
   * model list (the combo form) passes it down so the two do not each run the full
   * fetch set — and so both always see the same list.
   */
  groups?: AvailableModelGroup[];
  models?: AvailableModel[];
  combos?: ComboSummary[];
  /**
   * Controlled per-model reasoning effort, for a host that batches the write into its own
   * save step. Keyed by model value (`provider/model`), in the same key space the picker emits.
   * A missing key renders as "inherit". Combos are excluded — the model-defaults store
   * only accepts `provider/model` keys.
   */
  modelEfforts?: Record<string, string>;
  onEffortChange?: (modelValue: string, effort: ModelEffort) => void;
  /**
   * Self-managed effort, the default: the picker reads the model-defaults store itself and
   * writes each change immediately, so a surface with no save step of its own still gets the
   * control. Ignored when `onEffortChange` is supplied; pass false to drop effort entirely.
   */
  manageEffortDefaults?: boolean;
}

export default function ModelSelectModal({
  isOpen,
  onClose,
  onSelect,
  selectedModel,
  activeProviders = [],
  title = "Select Model",
  modelAliases = NO_ALIASES,
  addedModelValues = [],
  multiSelect = false,
  enableModelTest = true,
  groups: groupsProp,
  combos: combosProp,
  modelEfforts,
  onEffortChange,
  manageEffortDefaults = true,
}: ModelSelectModalProps) {
  const tCommon = useTranslations("common");
  const [searchQuery, setSearchQuery] = useState("");

  // MAJ-6: when the parent supplies the derived data, do not fetch it a second time.
  const hasSuppliedData = groupsProp !== undefined;
  const fetched = useAvailableModels({
    enabled: isOpen && !hasSuppliedData,
    connections: activeProviders,
    modelAliases,
  });
  const groupedModels = hasSuppliedData ? groupsProp : fetched.groups;
  const combos = combosProp ?? fetched.combos;

  // Self-managed effort mode. The hook is always called (rules of hooks) but stays inert
  // until the modal is open in that mode. Either controlled prop opts out of it — reading
  // from a parent map while writing to the global store would make every change revert.
  const isSelfManaged = !onEffortChange && !modelEfforts && manageEffortDefaults;
  const ownEfforts = useModelEffortDefaults({ enabled: isOpen && isSelfManaged });
  const efforts = modelEfforts ?? (isSelfManaged ? ownEfforts.efforts : EMPTY_EFFORTS);

  // Self-managed writes have no save button behind them, so a failed one has to show up on
  // the control itself — otherwise the value just snaps back with no explanation.
  const [effortErrors, setEffortErrors] = useState<Record<string, boolean>>({});
  const saveOwnEffort = useCallback(
    async (modelValue: string, effort: ModelEffort) => {
      const ok = await ownEfforts.saveEffort(modelValue, effort);
      setEffortErrors((prev) => (prev[modelValue] === !ok ? prev : { ...prev, [modelValue]: !ok }));
    },
    [ownEfforts]
  );
  const handleEffortChange = onEffortChange ?? (isSelfManaged ? saveOwnEffort : undefined);

  const [testingModels, setTestingModels] = useState<Record<string, boolean>>({});
  const [modelTestStatus, setModelTestStatus] = useState<Record<string, "ok" | "error">>({});
  const modelTestControllersRef = useRef<Record<string, AbortController>>({});

  useEffect(() => {
    if (!isOpen) {
      for (const controller of Object.values(modelTestControllersRef.current)) {
        controller.abort();
      }
      modelTestControllersRef.current = {};
      setTestingModels({});
      setModelTestStatus({});
      setEffortErrors({});
    }
  }, [isOpen]);

  useEffect(
    () => () => {
      for (const controller of Object.values(modelTestControllersRef.current)) {
        controller.abort();
      }
      modelTestControllersRef.current = {};
    },
    []
  );

  const handleTestModel = useCallback(
    async (modelValue: string, key: string) => {
      if (!enableModelTest || !modelValue) return;
      if (modelTestControllersRef.current[key]) return;

      const controller = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 30000);
      modelTestControllersRef.current[key] = controller;

      setTestingModels((prev) => ({ ...prev, [key]: true }));
      setModelTestStatus((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });

      try {
        const res = await fetch("/api/models/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: modelValue }),
          signal: controller.signal,
        });
        const payload = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          status?: number | string;
        };
        const providerStatus =
          typeof payload.status === "number"
            ? payload.status
            : typeof payload.status === "string" && /^\d+$/.test(payload.status)
              ? Number.parseInt(payload.status, 10)
              : null;
        const passed = res.ok && payload.ok === true && !(providerStatus && providerStatus >= 400);
        setModelTestStatus((prev) => ({ ...prev, [key]: passed ? "ok" : "error" }));
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError" && !timedOut) {
          return;
        }
        setModelTestStatus((prev) => ({ ...prev, [key]: "error" }));
      } finally {
        clearTimeout(timeout);
        if (modelTestControllersRef.current[key] === controller) {
          delete modelTestControllersRef.current[key];
        }
        setTestingModels((prev) => ({ ...prev, [key]: false }));
      }
    },
    [enableModelTest]
  );

  // Filter combos by search query
  const filteredCombos = useMemo(() => {
    if (!searchQuery.trim()) return combos;
    const query = searchQuery.toLowerCase();
    return combos.filter((c) => c.name.toLowerCase().includes(query));
  }, [combos, searchQuery]);

  // Filter models by search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedModels;

    const q = searchQuery.toLowerCase();
    const result: AvailableModelGroup[] = [];

    groupedModels.forEach((group) => {
      const matchedModels = group.models.filter(
        (m) =>
          String(m.name ?? "")
            .toLowerCase()
            .includes(q) ||
          String(m.id ?? "")
            .toLowerCase()
            .includes(q)
      );

      const providerNameMatches = group.name.toLowerCase().includes(q);

      if (matchedModels.length > 0) {
        result.push({ ...group, models: matchedModels });
      } else if (providerNameMatches) {
        result.push({ ...group, models: group.models });
      }
    });

    return result;
  }, [groupedModels, searchQuery]);

  const handleSelect = (model: ModelItem) => {
    onSelect(model);
    if (!multiSelect) {
      onClose();
      setSearchQuery("");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        onClose();
        setSearchQuery("");
      }}
      title={title}
      size="md"
      className="p-4!"
    >
      {/* Search - compact */}
      <div className="mb-3">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted text-[16px]">
            search
          </span>
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-surface border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
      </div>

      {/* Models grouped by provider - compact */}
      <div className="max-h-[300px] overflow-y-auto space-y-3">
        {/* Combos section - always first */}
        {filteredCombos.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5 sticky top-0 bg-surface py-0.5">
              <span className="material-symbols-outlined text-primary text-[14px]">layers</span>
              <span className="text-xs font-medium text-primary">Combos</span>
              <span className="text-[10px] text-text-muted">({filteredCombos.length})</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {filteredCombos.map((combo) => {
                const isAdded = addedModelValues.includes(combo.name);
                const isHighlighted = !multiSelect && selectedModel === combo.name;
                return (
                  <button
                    key={combo.id}
                    onClick={() =>
                      handleSelect({ id: combo.name, name: combo.name, value: combo.name })
                    }
                    className={`
                      px-2 py-1 rounded-xl text-xs font-medium transition-all border hover:cursor-pointer
                      ${
                        isHighlighted
                          ? "bg-primary text-white border-primary"
                          : isAdded
                            ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                            : "bg-surface border-border text-text-main hover:border-primary/50 hover:bg-primary/5"
                      }
                    `}
                  >
                    {isAdded && (
                      <span className="mr-0.5 opacity-70 text-[10px] uppercase">added</span>
                    )}
                    {combo.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Provider models */}
        {filteredGroups.map(({ providerId, ...group }) => (
          <div key={providerId}>
            {/* Provider header */}
            <div className="flex items-center gap-1.5 mb-1.5 sticky top-0 bg-surface py-0.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
              <span className="text-xs font-medium text-primary">{group.name}</span>
              <span className="text-[10px] text-text-muted">({group.models.length})</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {group.models.map((model, modelIndex) => {
                const isAdded = addedModelValues.includes(model.value);
                const isHighlighted = !multiSelect && selectedModel === model.value;
                const modelValue = String(model.value ?? "");
                const testKey = `${providerId}:${modelValue}`;
                const isTestingModel = !!testingModels[testKey];
                const testStatus = modelTestStatus[testKey];
                const testLabel = isTestingModel
                  ? "Testing model..."
                  : testStatus === "ok"
                    ? "Model test passed"
                    : testStatus === "error"
                      ? "Model test failed"
                      : "Test model";

                // The chip is a group of up to three segments: name, test, effort.
                // Only the first and last segment get rounded outer corners.
                const showEffort = !!handleEffortChange;
                const isGrouped = enableModelTest || showEffort;

                const nameButton = (
                  <button
                    key={`${providerId}-${String(model.id)}-${modelIndex}`}
                    onClick={() => handleSelect(model)}
                    className={`
                      px-2 py-1 text-xs font-medium transition-all border hover:cursor-pointer
                      ${isGrouped ? "rounded-l-xl border-r-0" : "rounded-xl"}
                      ${
                        isHighlighted
                          ? "bg-primary text-white border-primary"
                          : isAdded
                            ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                            : "bg-surface border-border text-text-main hover:border-primary/50 hover:bg-primary/5"
                      }
                    `}
                  >
                    {isAdded && (
                      <span className="mr-0.5 opacity-70 text-[10px] uppercase">added</span>
                    )}
                    {String(model.name ?? model.id ?? "")}
                    {model.isCustom ? " ★" : ""}
                  </button>
                );

                if (!isGrouped) return nameButton;

                return (
                  <div
                    key={`${providerId}-${String(model.id)}-${modelIndex}`}
                    className="inline-flex"
                  >
                    {nameButton}
                    {enableModelTest && (
                      <button
                        type="button"
                        onClick={() => handleTestModel(modelValue, testKey)}
                        disabled={isTestingModel}
                        aria-label={testLabel}
                        title={testLabel}
                        className={`
                          px-1.5 py-1 text-xs border transition-all
                          ${showEffort ? "border-r-0" : "rounded-r-xl"}
                          ${
                            testStatus === "ok"
                              ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                              : testStatus === "error"
                                ? "border-red-500/40 text-red-600 dark:text-red-400 bg-red-500/10"
                                : "border-border text-text-muted bg-surface hover:border-primary/50 hover:text-primary"
                          }
                          ${isTestingModel ? "opacity-60 cursor-not-allowed" : "hover:cursor-pointer"}
                        `}
                      >
                        <span
                          className={`material-symbols-outlined text-[12px] ${isTestingModel ? "animate-spin" : ""}`}
                          aria-hidden="true"
                        >
                          {isTestingModel
                            ? "progress_activity"
                            : testStatus === "ok"
                              ? "check_circle"
                              : testStatus === "error"
                                ? "error"
                                : "play_arrow"}
                        </span>
                      </button>
                    )}
                    {showEffort && (
                      <ModelEffortSelect
                        modelValue={modelValue}
                        value={efforts[modelValue]}
                        error={!!effortErrors[modelValue]}
                        onChange={(effort) => handleEffortChange(modelValue, effort)}
                        className="rounded-r-xl"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {filteredGroups.length === 0 && filteredCombos.length === 0 && (
          <div className="text-center py-4 text-text-muted">
            <span className="material-symbols-outlined text-2xl mb-1 block">search_off</span>
            <p className="text-xs">No models found</p>
          </div>
        )}
      </div>

      {multiSelect && (
        <div className="flex justify-end mt-3 pt-3 border-t border-border">
          <Button
            type="button"
            onClick={() => {
              onClose();
              setSearchQuery("");
            }}
            size="sm"
          >
            {tCommon("close")}
          </Button>
        </div>
      )}
    </Modal>
  );
}
