"use client";

import { Button, Input, Modal, ModelSelectModal } from "@/shared/components";
import Tooltip from "@/shared/components/Tooltip";
import { splitModelString } from "@/shared/models/model-string";
import { useAvailableModels } from "@/shared/models/use-available-models";
import { useModelEffortDefaults } from "@/shared/models/use-model-effort-defaults";
import { useNotificationStore } from "@/store/notificationStore";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ADVANCED_FIELD_HELP_FALLBACK,
  COMBO_TEMPLATE_FALLBACK,
  COMBO_TEMPLATES,
  STRATEGY_OPTIONS,
  VALID_NAME_REGEX,
} from "./combo-constants";
import { ComboReadinessPanel } from "./ComboReadinessPanel";
import { ComboModelRow } from "./ComboModelRow";
import { ComboTemplatePanel } from "./ComboTemplatePanel";
import { distributeWeights } from "./combo-template-policies";
import {
  COMBO_CONTEXT_LENGTH_FIELD,
  COMBO_MAX_OUTPUT_TOKENS_FIELD,
  parseTokenLimitInput,
  toTokenLimitInput,
} from "./combo-token-limit-fields";
import { resolveTemplate } from "./combo-template-resolver";
import type { ComboTemplate, TemplateResolution } from "./combo-template-types";
import { getProviderDisplayName, normalizeModelEntry } from "./combo-data";
import type {
  ComboModelEntry,
  ComboRecord,
  ModelAliases,
  PricingByProvider,
  ProviderConnection,
  ProviderNode,
} from "./combo-types";
import {
  getI18nOrFallback,
  getStrategyDescription,
  getStrategyLabel,
  uniqueComboName,
} from "./combo-utils";
import { FieldLabelWithHelp } from "./FieldLabelWithHelp";
import { StrategyGuidanceCard } from "./StrategyGuidanceCard";
import { StrategyRecommendationsPanel } from "./StrategyRecommendationsPanel";
import { WeightTotalBar } from "./WeightTotalBar";

function createModelRowId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type ComboSaveData = Omit<ComboRecord, "id" | "isActive">;

interface ComboFormModalProps {
  isOpen: boolean;
  combo: ComboRecord | null;
  onClose: () => void;
  onSave: (data: ComboSaveData) => Promise<void>;
  activeProviders: ProviderConnection[];
  /** The combo list the user is already looking at — used to keep suggested names unique. */
  combos: ComboRecord[];
}

export function ComboFormModal({
  isOpen,
  combo,
  onClose,
  onSave,
  activeProviders,
  combos,
}: ComboFormModalProps) {
  const t = useTranslations("combos");
  const tc = useTranslations("common");
  const notify = useNotificationStore();
  const initialFormState = useMemo(
    () => ({
      name: combo?.name || "",
      models: (combo?.models || []).map((m: string | ComboModelEntry) => normalizeModelEntry(m)),
      strategy: combo?.strategy || "priority",
      config: combo?.config || {},
      agentSystemMessage: combo?.system_message || "",
      agentToolFilter: combo?.tool_filter_regex || "",
      agentContextCache: !!combo?.context_cache_protection,
      requireToolCalling: !!combo?.requireToolCalling,
      contextLength: toTokenLimitInput(combo?.context_length, COMBO_CONTEXT_LENGTH_FIELD),
      maxOutputTokens: toTokenLimitInput(combo?.max_output_tokens, COMBO_MAX_OUTPUT_TOKENS_FIELD),
    }),
    [combo]
  );
  const [name, setName] = useState(combo?.name || "");
  const [models, setModels] = useState<
    Array<{ model: string; weight: number; disabled?: boolean }>
  >(() => {
    return (combo?.models || []).map((m: string | ComboModelEntry) => normalizeModelEntry(m));
  });
  const [strategy, setStrategy] = useState(combo?.strategy || "priority");
  // Reasoning-effort defaults are model-level and global; the combo record never carries
  // them. Edits here are written only after the combo itself saves.
  const modelEfforts = useModelEffortDefaults({ enabled: isOpen });
  const [showModelSelect, setShowModelSelect] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [pricingByProvider, setPricingByProvider] = useState<PricingByProvider>({});
  const [modelAliases, setModelAliases] = useState<ModelAliases>({});
  const [providerNodes, setProviderNodes] = useState<ProviderNode[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [config, setConfig] = useState<Record<string, boolean | number | string | undefined>>(
    combo?.config || {}
  );
  const [showStrategyNudge, setShowStrategyNudge] = useState(false);
  const strategyNudgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [agentSystemMessage, setAgentSystemMessage] = useState<string>(combo?.system_message || "");
  const [agentToolFilter, setAgentToolFilter] = useState<string>(combo?.tool_filter_regex || "");
  const [agentContextCache, setAgentContextCache] = useState<boolean>(
    !!combo?.context_cache_protection
  );
  const [requireToolCalling, setRequireToolCalling] = useState<boolean>(
    !!combo?.requireToolCalling
  );
  const [contextLength, setContextLength] = useState<string>(() =>
    toTokenLimitInput(combo?.context_length, COMBO_CONTEXT_LENGTH_FIELD)
  );
  const [maxOutputTokens, setMaxOutputTokens] = useState<string>(() =>
    toTokenLimitInput(combo?.max_output_tokens, COMBO_MAX_OUTPUT_TOKENS_FIELD)
  );
  const [modelRowIds, setModelRowIds] = useState<string[]>(() =>
    (combo?.models || []).map(() => createModelRowId())
  );
  const [testingModels, setTestingModels] = useState<Record<string, boolean>>({});
  const [modelTestStatus, setModelTestStatus] = useState<Record<string, "ok" | "error">>({});
  const modelTestControllersRef = useRef<Record<string, AbortController>>({});
  const modalFetchControllerRef = useRef<AbortController | null>(null);
  const modelTestSessionRef = useRef(0);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  /**
   * Tier-C provenance for the rows a template just applied, keyed by ROW ID so a reorder
   * or delete cannot desync it. Never persisted — `normalizeModelEntry` carries only
   * model/weight/disabled, and this is provenance of a recommendation, not a combo field.
   */
  const [limitedFreeTierRows, setLimitedFreeTierRows] = useState<Record<string, boolean>>({});

  // Single source of truth for "what can this user pick", shared with the picker below so
  // the two never disagree and the fetch set runs once per session, not twice.
  const {
    groups: availableGroups,
    models: availableModels,
    combos: pickerCombos,
  } = useAvailableModels({
    enabled: isOpen,
    connections: activeProviders,
    modelAliases,
  });

  const templateResolutions = useMemo(() => {
    const entries = COMBO_TEMPLATES.map((template) => [
      template.id,
      resolveTemplate({
        template,
        groups: availableGroups,
        connections: activeProviders,
        pricingByProvider,
        providerNodes,
      }),
    ]);
    return Object.fromEntries(entries) as Record<string, TemplateResolution>;
  }, [availableGroups, activeProviders, pricingByProvider, providerNodes]);

  const hasPricingForModel = useCallback(
    (modelValue: string) => {
      if (!modelValue || typeof modelValue !== "string") return false;

      const split = splitModelString(modelValue);
      if (!split) return false;

      const { providerRef: providerIdentifier, modelId } = split;
      const matchedNode = providerNodes.find(
        (node) => node.id === providerIdentifier || node.prefix === providerIdentifier
      );

      const providerCandidates = [providerIdentifier];
      if (matchedNode?.apiType) providerCandidates.push(matchedNode.apiType);
      if (matchedNode?.name) providerCandidates.push(String(matchedNode.name).toLowerCase());

      return providerCandidates.some((candidate) => !!pricingByProvider?.[candidate]?.[modelId]);
    },
    [pricingByProvider, providerNodes]
  );

  const weightTotal = models.reduce(
    (sum, modelEntry) => sum + (modelEntry.disabled ? 0 : modelEntry.weight || 0),
    0
  );
  const activeModels = models.filter((m) => !m.disabled);
  const pricedModelCount = activeModels.reduce(
    (count, modelEntry) => count + (hasPricingForModel(modelEntry.model) ? 1 : 0),
    0
  );
  const pricingCoveragePercent =
    activeModels.length > 0 ? Math.round((pricedModelCount / activeModels.length) * 100) : 0;
  const hasNoModels = models.length === 0;
  const hasNoActiveModels = activeModels.length === 0;
  const hasRoundRobinSingleModel = strategy === "round-robin" && activeModels.length === 1;
  const hasCostOptimizedWithoutPricing =
    strategy === "cost-optimized" && activeModels.length > 0 && pricedModelCount === 0;
  const hasCostOptimizedPartialPricing =
    strategy === "cost-optimized" &&
    activeModels.length > 0 &&
    pricedModelCount > 0 &&
    pricedModelCount < activeModels.length;
  const hasInvalidWeightedTotal =
    strategy === "weighted" && activeModels.length > 0 && weightTotal !== 100;
  const parsedContextLength = useMemo(
    () => parseTokenLimitInput(contextLength, COMBO_CONTEXT_LENGTH_FIELD),
    [contextLength]
  );
  const parsedMaxOutputTokens = useMemo(
    () => parseTokenLimitInput(maxOutputTokens, COMBO_MAX_OUTPUT_TOKENS_FIELD),
    [maxOutputTokens]
  );
  const saveBlocked =
    !name.trim() ||
    !!nameError ||
    saving ||
    hasNoModels ||
    hasNoActiveModels ||
    hasInvalidWeightedTotal ||
    hasCostOptimizedWithoutPricing ||
    !parsedContextLength.ok ||
    !parsedMaxOutputTokens.ok;
  const readinessChecks = [
    {
      id: "name",
      ok: !!name.trim() && !nameError,
      label: getI18nOrFallback(t, "readinessCheckName", "Combo name is valid"),
    },
    {
      id: "models",
      ok: !hasNoModels && !hasNoActiveModels,
      label: getI18nOrFallback(t, "readinessCheckModels", "At least one model is active"),
    },
    {
      id: "weights",
      ok: strategy === "weighted" ? !hasInvalidWeightedTotal : true,
      label:
        strategy === "weighted"
          ? getI18nOrFallback(t, "readinessCheckWeights", "Weighted total is 100%")
          : getI18nOrFallback(t, "readinessCheckWeightsOptional", "Weight rule not required"),
    },
    {
      id: "pricing",
      ok: strategy === "cost-optimized" ? !hasCostOptimizedWithoutPricing : true,
      label:
        strategy === "cost-optimized"
          ? getI18nOrFallback(t, "readinessCheckPricing", "Pricing data is available")
          : getI18nOrFallback(t, "readinessCheckPricingOptional", "Pricing rule not required"),
    },
  ];
  const saveBlockers: string[] = [];
  if (!name.trim()) {
    saveBlockers.push(getI18nOrFallback(t, "saveBlockName", "Define a combo name."));
  } else if (nameError) {
    saveBlockers.push(nameError);
  }
  if (hasNoModels) {
    saveBlockers.push(getI18nOrFallback(t, "saveBlockModels", "Add at least one model."));
  }
  if (hasNoActiveModels && !hasNoModels) {
    saveBlockers.push(
      getI18nOrFallback(t, "saveBlockNoActiveModels", "Enable at least one model.")
    );
  }
  if (hasInvalidWeightedTotal) {
    saveBlockers.push(
      getI18nOrFallback(t, "saveBlockWeighted", `Set weights to 100% (current: ${weightTotal}%).`, {
        total: weightTotal,
      })
    );
  }
  if (hasCostOptimizedWithoutPricing) {
    saveBlockers.push(
      getI18nOrFallback(
        t,
        "saveBlockPricing",
        "Add pricing for at least one model or choose a different strategy."
      )
    );
  }

  const fetchModalData = async (signal: AbortSignal) => {
    try {
      const [aliasesRes, nodesRes, pricingRes] = await Promise.all([
        fetch("/api/models/alias", { signal }),
        fetch("/api/provider-nodes", { signal }),
        fetch("/api/pricing", { signal }),
      ]);

      if (!aliasesRes.ok || !nodesRes.ok) {
        throw new Error(
          `Failed to fetch data: aliases=${aliasesRes.status}, nodes=${nodesRes.status}`
        );
      }
      const pricingData = pricingRes.ok ? await pricingRes.json() : {};

      const [aliasesData, nodesData] = await Promise.all([aliasesRes.json(), nodesRes.json()]);
      if (!signal.aborted) {
        setPricingByProvider(
          pricingData && typeof pricingData === "object" && !Array.isArray(pricingData)
            ? pricingData
            : {}
        );
        setModelAliases(aliasesData.aliases || {});
        setProviderNodes(nodesData.nodes || []);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Error fetching modal data:", error);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      modalFetchControllerRef.current?.abort();
      modalFetchControllerRef.current = null;
      return;
    }

    const controller = new AbortController();
    modalFetchControllerRef.current = controller;
    fetchModalData(controller.signal);

    return () => {
      controller.abort();
      if (modalFetchControllerRef.current === controller) {
        modalFetchControllerRef.current = null;
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      modelTestSessionRef.current += 1;
      for (const controller of Object.values(modelTestControllersRef.current)) {
        controller.abort();
      }
      modelTestControllersRef.current = {};
      modalFetchControllerRef.current?.abort();
      modalFetchControllerRef.current = null;
      setTestingModels({});
      return;
    }

    modelTestSessionRef.current += 1;

    setName(initialFormState.name);
    setModels(initialFormState.models);
    setModelRowIds(initialFormState.models.map(() => createModelRowId()));
    setLimitedFreeTierRows({});
    setStrategy(initialFormState.strategy);
    setConfig(initialFormState.config);
    setAgentSystemMessage(initialFormState.agentSystemMessage);
    setAgentToolFilter(initialFormState.agentToolFilter);
    setAgentContextCache(initialFormState.agentContextCache);
    setRequireToolCalling(initialFormState.requireToolCalling);
    setContextLength(initialFormState.contextLength);
    setMaxOutputTokens(initialFormState.maxOutputTokens);

    setShowModelSelect(false);
    setSaving(false);
    setNameError("");
    setShowAdvanced(false);
    setShowStrategyNudge(false);
    setDragIndex(null);
    setDragOverIndex(null);
    setTestingModels({});
    setModelTestStatus({});
  }, [initialFormState, isOpen]);

  useEffect(
    () => () => {
      for (const controller of Object.values(modelTestControllersRef.current)) {
        controller.abort();
      }
      modelTestControllersRef.current = {};
      modalFetchControllerRef.current?.abort();
      modalFetchControllerRef.current = null;
    },
    []
  );

  const triggerStrategyNudge = useCallback(() => {
    setShowStrategyNudge(true);
    if (strategyNudgeTimeoutRef.current) {
      clearTimeout(strategyNudgeTimeoutRef.current);
    }
    strategyNudgeTimeoutRef.current = setTimeout(() => setShowStrategyNudge(false), 2600);
  }, []);

  useEffect(
    () => () => {
      if (strategyNudgeTimeoutRef.current) {
        clearTimeout(strategyNudgeTimeoutRef.current);
      }
    },
    []
  );

  const validateName = (value: string) => {
    if (!value.trim()) {
      setNameError(t("nameRequired"));
      return false;
    }
    if (!VALID_NAME_REGEX.test(value)) {
      setNameError(t("nameInvalid"));
      return false;
    }
    setNameError("");
    return true;
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setName(value);
    if (value) validateName(value);
    else setNameError("");
  };

  const handleToggleModel = (model: { value: string }) => {
    const value = model.value;
    const existingIndex = models.findIndex((m) => m.model === value);
    if (existingIndex >= 0) {
      const rowId = modelRowIds[existingIndex];
      modelTestControllersRef.current[rowId]?.abort();
      delete modelTestControllersRef.current[rowId];
      setTestingModels((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      setModelTestStatus((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      setLimitedFreeTierRows((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      setModels(models.filter((_, index) => index !== existingIndex));
      setModelRowIds(modelRowIds.filter((_, index) => index !== existingIndex));
    } else {
      setModels([...models, { model: value, weight: 0 }]);
      setModelRowIds([...modelRowIds, createModelRowId()]);
    }
  };

  const handleRemoveModel = (index: number) => {
    const rowId = modelRowIds[index];
    modelTestControllersRef.current[rowId]?.abort();
    delete modelTestControllersRef.current[rowId];
    setTestingModels((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setModelTestStatus((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setLimitedFreeTierRows((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setModels(models.filter((_, i) => i !== index));
    setModelRowIds(modelRowIds.filter((_, i) => i !== index));
  };

  const handleWeightChange = (index: number, weight: string | number) => {
    const newModels = [...models];
    newModels[index] = {
      ...newModels[index],
      weight: Math.max(0, Math.min(100, Number(weight) || 0)),
    };
    setModels(newModels);
  };

  const handleToggleDisabled = (index: number) => {
    const newModels = [...models];
    newModels[index] = {
      ...newModels[index],
      disabled: !newModels[index].disabled,
    };
    setModels(newModels);
  };
  // Weight splitting lives in distributeWeights because the old inline version kept its
  // running counter in the component body and never reset it, so a second click in the
  // same tick dropped the remainder and left the total at 99.
  const handleAutoBalance = () => setModels((prev) => distributeWeights(prev));

  const applyStrategyRecommendations = () => {
    const strategyDefaults: Record<string, Record<string, string | number | boolean>> = {
      priority: { maxRetries: 2, retryDelayMs: 1500, healthCheckEnabled: true },
      weighted: { maxRetries: 1, retryDelayMs: 1000, healthCheckEnabled: true },
      "round-robin": {
        maxRetries: 1,
        retryDelayMs: 750,
        healthCheckEnabled: true,
        concurrencyPerModel: 3,
        queueTimeoutMs: 30000,
      },
      random: { maxRetries: 1, retryDelayMs: 1000, healthCheckEnabled: true },
      "least-used": { maxRetries: 1, retryDelayMs: 1000, healthCheckEnabled: true },
      "cost-optimized": { maxRetries: 1, retryDelayMs: 500, healthCheckEnabled: true },
    };

    const defaults = strategyDefaults[strategy] || strategyDefaults.priority;
    setConfig((prev) => {
      const next = { ...prev };
      for (const [key, value] of Object.entries(defaults)) {
        if (next[key] === undefined || next[key] === null || next[key] === "") {
          next[key] = value;
        }
      }
      return next;
    });

    if (strategy === "weighted" && models.length > 1) {
      handleAutoBalance();
    }

    if (strategy === "round-robin") {
      setShowAdvanced(true);
    }

    notify.success(
      getI18nOrFallback(t, "recommendationsApplied", "Recommendations applied to this combo.")
    );
  };

  const applyTemplate = (template: ComboTemplate, resolution: TemplateResolution) => {
    if (!resolution.ok) return; // defensive; the panel already disabled this button

    setStrategy(template.strategy);
    setConfig((prev) => ({ ...prev, ...template.config }));
    if (!name.trim()) {
      setName(
        uniqueComboName(
          template.suggestedName,
          combos.map((c) => c.name)
        )
      );
    }

    const rowIds = resolution.models.map(() => createModelRowId());
    // Weights already match the template's strategy (phase 04 weightMode) — do NOT
    // auto-balance here.
    setModels(resolution.models.map(({ model, weight }) => ({ model, weight })));
    setModelRowIds(rowIds);
    setLimitedFreeTierRows(
      Object.fromEntries(
        resolution.models.flatMap((m, index) => (m.limitedFreeTier ? [[rowIds[index], true]] : []))
      )
    );

    const metered = resolution.models.filter((m) => m.limitedFreeTier).length;
    const applied = getI18nOrFallback(
      t,
      "templateAppliedCount",
      "Applied {count} models from {template}.",
      {
        count: String(resolution.models.length),
        template: getI18nOrFallback(t, template.titleKey, template.fallbackTitle),
      }
    );
    const meteredSuffix =
      metered > 0
        ? ` ${getI18nOrFallback(t, "templateMeteredCount", "({metered} metered)", {
            metered: String(metered),
          })}`
        : "";
    notify.success(`${applied}${meteredSuffix}`);

    if (resolution.models.length < resolution.requested) {
      notify.info(
        getI18nOrFallback(
          t,
          "templatePartialResult",
          "Only {count} of {requested} models were available.",
          { count: String(resolution.models.length), requested: String(resolution.requested) }
        )
      );
    }
  };

  const formatModelDisplay = useCallback(
    (modelValue: string) => getProviderDisplayName(modelValue, providerNodes),
    [providerNodes]
  );

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newModels = [...models];
    const newRowIds = [...modelRowIds];
    [newModels[index - 1], newModels[index]] = [newModels[index], newModels[index - 1]];
    [newRowIds[index - 1], newRowIds[index]] = [newRowIds[index], newRowIds[index - 1]];
    setModels(newModels);
    setModelRowIds(newRowIds);
  };

  const handleMoveDown = (index: number) => {
    if (index === models.length - 1) return;
    const newModels = [...models];
    const newRowIds = [...modelRowIds];
    [newModels[index], newModels[index + 1]] = [newModels[index + 1], newModels[index]];
    [newRowIds[index], newRowIds[index + 1]] = [newRowIds[index + 1], newRowIds[index]];
    setModels(newModels);
    setModelRowIds(newRowIds);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
    const el = e.currentTarget as HTMLElement | null;
    if (el) {
      setTimeout(() => {
        if (el.isConnected) el.style.opacity = "0.5";
      }, 0);
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    const el = e.currentTarget as HTMLElement | null;
    if (el) el.style.opacity = "1";
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const fromIndex = dragIndex;
    if (fromIndex === null || fromIndex === dropIndex) return;

    const newModels = [...models];
    const newRowIds = [...modelRowIds];
    const [moved] = newModels.splice(fromIndex, 1);
    const [movedRowId] = newRowIds.splice(fromIndex, 1);
    newModels.splice(dropIndex, 0, moved);
    newRowIds.splice(dropIndex, 0, movedRowId);
    setModels(newModels);
    setModelRowIds(newRowIds);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleTestModel = async (modelValue: string, key: string) => {
    if (!modelValue) return;
    if (testingModels[key]) return;

    const requestSessionId = modelTestSessionRef.current;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30000);
    modelTestControllersRef.current[key]?.abort();
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

      if (modelTestSessionRef.current !== requestSessionId) {
        return;
      }

      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
        latencyMs?: number;
      };
      if (res.ok && payload.ok) {
        setModelTestStatus((prev) => ({ ...prev, [key]: "ok" }));
        notify.success(
          getI18nOrFallback(t, "modelTestSuccess", "Model test passed in {ms}ms.", {
            ms: payload.latencyMs ?? 0,
          })
        );
      } else {
        const errorMessage =
          (typeof payload.error === "string" && payload.error) ||
          (typeof payload.message === "string" && payload.message) ||
          getI18nOrFallback(t, "testFailed", "Test request failed");
        setModelTestStatus((prev) => ({ ...prev, [key]: "error" }));
        notify.error(errorMessage);
      }
    } catch (error) {
      if (modelTestSessionRef.current !== requestSessionId) {
        return;
      }
      if (error instanceof Error && error.name === "AbortError" && !timedOut) {
        return;
      }
      setModelTestStatus((prev) => ({ ...prev, [key]: "error" }));
      notify.error(getI18nOrFallback(t, "testFailed", "Test request failed"));
    } finally {
      clearTimeout(timeout);
      if (modelTestControllersRef.current[key] === controller) {
        delete modelTestControllersRef.current[key];
      }
      if (
        modelTestSessionRef.current === requestSessionId &&
        modelTestControllersRef.current[key] !== controller
      ) {
        setTestingModels((prev) => ({ ...prev, [key]: false }));
      }
    }
  };

  const handleSave = async () => {
    if (!validateName(name)) return;
    if (hasNoModels || hasInvalidWeightedTotal || hasCostOptimizedWithoutPricing) return;
    if (saving) return;
    setSaving(true);

    try {
      const saveData: ComboSaveData = {
        name: name.trim(),
        models: models.map((m) => {
          const entry: ComboModelEntry = { model: m.model };
          if (strategy === "weighted") entry.weight = m.weight;
          if (m.disabled) entry.disabled = true;
          return entry;
        }),
        strategy,
      };

      const configToSave = { ...config };
      if (strategy === "round-robin") {
        if (config.concurrencyPerModel !== undefined)
          configToSave.concurrencyPerModel = config.concurrencyPerModel;
        if (config.queueTimeoutMs !== undefined)
          configToSave.queueTimeoutMs = config.queueTimeoutMs;
      }
      if (Object.keys(configToSave).length > 0) {
        saveData.config = configToSave;
      }

      if (agentSystemMessage.trim()) saveData.system_message = agentSystemMessage.trim();
      else delete saveData.system_message;
      if (agentToolFilter.trim()) saveData.tool_filter_regex = agentToolFilter.trim();
      else delete saveData.tool_filter_regex;
      if (agentContextCache) saveData.context_cache_protection = true;
      else delete saveData.context_cache_protection;
      if (requireToolCalling) saveData.requireToolCalling = true;
      else delete saveData.requireToolCalling;

      // Always sent, and null rather than omitted for an empty box: the update endpoint
      // merges its body into the stored combo, so leaving the key out would keep the old
      // limit and make clearing the field impossible. An unparseable box cannot reach here
      // — saveBlocked covers it — so the null fallback is only there to keep the type honest.
      saveData.context_length = parsedContextLength.ok ? parsedContextLength.value : null;
      saveData.max_output_tokens = parsedMaxOutputTokens.ok ? parsedMaxOutputTokens.value : null;

      await onSave(saveData);

      // After the combo, so a rejected save does not leave effort changes behind. A failure
      // here is not fatal to the combo — surface it and keep the edits pending.
      const effortsSaved = await modelEfforts.save();
      if (!effortsSaved) {
        notify.error(
          getI18nOrFallback(t, "modelEffortSaveFailed", "Failed to save model reasoning effort")
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const isEdit = !!combo;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={isEdit ? t("editCombo") : t("createCombo")}
        size="full"
      >
        <div className="flex flex-col gap-3">
          <div>
            <Input
              label={t("comboName")}
              value={name}
              onChange={handleNameChange}
              placeholder={t("comboNamePlaceholder")}
              error={nameError}
            />
            <p className="text-[10px] text-text-muted mt-0.5">{t("nameHint")}</p>
          </div>

          {!isEdit && (
            <div className="rounded-lg border border-black/8 dark:border-white/8 bg-black/[0.02] dark:bg-white/[0.02] p-3">
              <div className="mb-2">
                <p className="text-xs font-medium">
                  {getI18nOrFallback(t, "templatesTitle", COMBO_TEMPLATE_FALLBACK.title)}
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">
                  {getI18nOrFallback(
                    t,
                    "templatesDescription",
                    COMBO_TEMPLATE_FALLBACK.description
                  )}
                </p>
              </div>
              <ComboTemplatePanel resolutions={templateResolutions} onApply={applyTemplate} />
            </div>
          )}

          <div>
            <div className="flex items-center gap-1 mb-1.5">
              <label className="text-sm font-medium">{t("routingStrategy")}</label>
              <Tooltip content={getStrategyDescription(t, strategy)}>
                <span className="material-symbols-outlined text-[13px] text-text-muted cursor-help">
                  help
                </span>
              </Tooltip>
            </div>
            <div className="grid grid-cols-3 gap-1 p-0.5 bg-black/5 dark:bg-white/5 rounded-lg">
              {STRATEGY_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => {
                    if (strategy === s.value) {
                      return;
                    }
                    setStrategy(s.value);
                    triggerStrategyNudge();
                  }}
                  data-testid={`strategy-option-${s.value}`}
                  title={getStrategyDescription(t, s.value)}
                  aria-label={`${getStrategyLabel(t, s.value)}. ${getStrategyDescription(t, s.value)}`}
                  className={`py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                    strategy === s.value
                      ? "bg-white dark:bg-bg-main shadow-sm text-primary"
                      : "text-text-muted hover:text-text-main"
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px] align-middle mr-0.5">
                    {s.icon}
                  </span>
                  {getStrategyLabel(t, s.value)}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-text-muted mt-0.5">
              {getStrategyDescription(t, strategy)}
            </p>
            <div className="mt-2">
              <StrategyGuidanceCard strategy={strategy} />
            </div>
            <div className="mt-2">
              <StrategyRecommendationsPanel
                strategy={strategy}
                onApply={applyStrategyRecommendations}
                showNudge={showStrategyNudge}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium">{t("models")}</label>
              {strategy === "weighted" && models.length > 1 && (
                <button
                  onClick={handleAutoBalance}
                  className="text-[10px] text-primary hover:text-primary/80 transition-colors"
                >
                  {t("autoBalance")}
                </button>
              )}
            </div>

            {models.length === 0 ? (
              <div className="text-center py-4 border border-dashed border-black/10 dark:border-white/10 rounded-lg bg-black/[0.01] dark:bg-white/[0.01]">
                <span className="material-symbols-outlined text-text-muted text-xl mb-1">
                  layers
                </span>
                <p className="text-xs text-text-muted">{t("noModelsYet")}</p>
              </div>
            ) : (
              <div
                data-testid="combo-model-list"
                className="flex flex-col gap-1 max-h-[240px] overflow-y-auto"
              >
                {models.map((entry, index) => {
                  const modelTestKey = modelRowIds[index] || `${index}:${entry.model}`;
                  return (
                    <ComboModelRow
                      key={modelTestKey}
                      entry={entry}
                      index={index}
                      total={models.length}
                      strategy={strategy}
                      displayName={formatModelDisplay(entry.model)}
                      isTesting={!!testingModels[modelTestKey]}
                      testStatus={modelTestStatus[modelTestKey]}
                      limitedFreeTier={!!limitedFreeTierRows[modelTestKey]}
                      hasPricing={hasPricingForModel(entry.model)}
                      effort={modelEfforts.efforts[entry.model]}
                      onEffortChange={modelEfforts.setEffort}
                      isDragging={dragIndex === index}
                      isDropTarget={dragOverIndex === index && dragIndex !== index}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onToggleDisabled={handleToggleDisabled}
                      onWeightChange={handleWeightChange}
                      onMoveUp={handleMoveUp}
                      onMoveDown={handleMoveDown}
                      onTest={() => handleTestModel(entry.model, modelTestKey)}
                      onRemove={handleRemoveModel}
                    />
                  );
                })}
              </div>
            )}

            {strategy === "weighted" && models.length > 0 && <WeightTotalBar models={models} />}

            {strategy === "cost-optimized" && models.length > 0 && (
              <div className="mt-2 rounded-md border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-2 py-1.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-text-muted">
                    {getI18nOrFallback(t, "pricingCoverage", "Pricing coverage")}
                  </span>
                  <span className="font-medium text-text-main">
                    {pricedModelCount}/{activeModels.length} ({pricingCoveragePercent}%)
                  </span>
                </div>
                <div className="h-1.5 mt-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      pricingCoveragePercent === 100
                        ? "bg-emerald-500"
                        : pricingCoveragePercent > 0
                          ? "bg-amber-500"
                          : "bg-red-500"
                    }`}
                    style={{ width: `${pricingCoveragePercent}%` }}
                  />
                </div>
                <p className="text-[10px] text-text-muted mt-1">
                  {getI18nOrFallback(
                    t,
                    "pricingCoverageHint",
                    "Cost-optimized works best when all combo models have pricing."
                  )}
                </p>
              </div>
            )}

            {hasNoModels && (
              <div className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-700 dark:text-amber-300 flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">warning</span>
                <span>{t("noModelsYet")}</span>
              </div>
            )}

            {hasInvalidWeightedTotal && (
              <div className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-700 dark:text-amber-300 flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">warning</span>
                <span>
                  {t("weighted")} {weightTotal}% {"≠"} 100%. {t("autoBalance")}
                </span>
              </div>
            )}

            {hasRoundRobinSingleModel && (
              <div className="mt-2 rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-1.5 text-[10px] text-blue-700 dark:text-blue-300 flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">info</span>
                <span>
                  {getI18nOrFallback(
                    t,
                    "warningRoundRobinSingleModel",
                    "Round-robin is most useful with at least 2 models."
                  )}
                </span>
              </div>
            )}

            {hasCostOptimizedPartialPricing && (
              <div className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-700 dark:text-amber-300 flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">warning</span>
                <span>
                  {getI18nOrFallback(
                    t,
                    "warningCostOptimizedPartialPricing",
                    `Only ${pricedModelCount} of ${activeModels.length} models have pricing. Routing may be partially cost-aware.`,
                    { priced: pricedModelCount, total: activeModels.length }
                  )}
                </span>
              </div>
            )}

            {hasCostOptimizedWithoutPricing && (
              <div className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-700 dark:text-amber-300 flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">warning</span>
                <span>
                  {getI18nOrFallback(
                    t,
                    "warningCostOptimizedNoPricing",
                    "No pricing data found for this combo. Cost-optimized may route unexpectedly."
                  )}
                </span>
              </div>
            )}

            <div className="mt-2">
              <ComboReadinessPanel checks={readinessChecks} blockers={saveBlockers} />
            </div>

            <button
              onClick={() => setShowModelSelect(true)}
              className="w-full mt-2 py-2 border border-dashed border-black/10 dark:border-white/10 rounded-lg text-xs text-text-muted hover:text-primary hover:border-primary/30 transition-colors flex items-center justify-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              {t("addModel")}
            </button>
          </div>

          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-main transition-colors self-start"
          >
            <span className="material-symbols-outlined text-[14px]">
              {showAdvanced ? "expand_less" : "expand_more"}
            </span>
            {t("advancedSettings")}
          </button>

          {showAdvanced && (
            <div className="flex flex-col gap-2 p-3 bg-black/[0.02] dark:bg-white/[0.02] rounded-lg border border-black/5 dark:border-white/5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabelWithHelp
                    label={t("maxRetries")}
                    help={getI18nOrFallback(
                      t,
                      "advancedHelp.maxRetries",
                      ADVANCED_FIELD_HELP_FALLBACK.maxRetries
                    )}
                  />
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={typeof config.maxRetries === "number" ? config.maxRetries : ""}
                    placeholder="1"
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        maxRetries: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="w-full text-xs py-1.5 px-2 rounded border border-black/10 dark:border-white/10 bg-transparent focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <FieldLabelWithHelp
                    label={t("retryDelay")}
                    help={getI18nOrFallback(
                      t,
                      "advancedHelp.retryDelay",
                      ADVANCED_FIELD_HELP_FALLBACK.retryDelay
                    )}
                  />
                  <input
                    type="number"
                    min="0"
                    max="60000"
                    step="500"
                    value={typeof config.retryDelayMs === "number" ? config.retryDelayMs : ""}
                    placeholder="2000"
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        retryDelayMs: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="w-full text-xs py-1.5 px-2 rounded border border-black/10 dark:border-white/10 bg-transparent focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <FieldLabelWithHelp
                    label={t("timeout")}
                    help={getI18nOrFallback(
                      t,
                      "advancedHelp.timeout",
                      ADVANCED_FIELD_HELP_FALLBACK.timeout
                    )}
                  />
                  <input
                    type="number"
                    min="1000"
                    max="600000"
                    step="1000"
                    value={typeof config.timeoutMs === "number" ? config.timeoutMs : ""}
                    placeholder="120000"
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        timeoutMs: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="w-full text-xs py-1.5 px-2 rounded border border-black/10 dark:border-white/10 bg-transparent focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabelWithHelp
                    label={t("healthcheck")}
                    help={getI18nOrFallback(
                      t,
                      "advancedHelp.healthcheck",
                      ADVANCED_FIELD_HELP_FALLBACK.healthcheck
                    )}
                  />
                  <input
                    type="checkbox"
                    checked={config.healthCheckEnabled !== false}
                    onChange={(e) => setConfig({ ...config, healthCheckEnabled: e.target.checked })}
                    className="accent-primary"
                  />
                </div>
              </div>
              {strategy === "round-robin" && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-black/5 dark:border-white/5">
                  <div>
                    <FieldLabelWithHelp
                      label={t("concurrencyPerModel")}
                      help={getI18nOrFallback(
                        t,
                        "advancedHelp.concurrencyPerModel",
                        ADVANCED_FIELD_HELP_FALLBACK.concurrencyPerModel
                      )}
                    />
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={
                        typeof config.concurrencyPerModel === "number"
                          ? config.concurrencyPerModel
                          : ""
                      }
                      placeholder="3"
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          concurrencyPerModel: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="w-full text-xs py-1.5 px-2 rounded border border-black/10 dark:border-white/10 bg-transparent focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <FieldLabelWithHelp
                      label={t("queueTimeout")}
                      help={getI18nOrFallback(
                        t,
                        "advancedHelp.queueTimeout",
                        ADVANCED_FIELD_HELP_FALLBACK.queueTimeout
                      )}
                    />
                    <input
                      type="number"
                      min="1000"
                      max="120000"
                      step="1000"
                      value={typeof config.queueTimeoutMs === "number" ? config.queueTimeoutMs : ""}
                      placeholder="30000"
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          queueTimeoutMs: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="w-full text-xs py-1.5 px-2 rounded border border-black/10 dark:border-white/10 bg-transparent focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>
              )}
              <p className="text-[10px] text-text-muted">{t("advancedHint")}</p>
            </div>
          )}

          <div className="flex flex-col gap-2 p-3 bg-black/[0.02] dark:bg-white/[0.02] rounded-lg border border-black/5 dark:border-white/5">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="material-symbols-outlined text-[14px] text-primary">smart_toy</span>
              <p className="text-xs font-medium">Agent Features</p>
              <span className="text-[10px] text-text-muted">
                — optional, for agent/tool workflows
              </span>
            </div>

            <div>
              <label className="text-[11px] font-medium text-text-muted block mb-0.5">
                System Message Override
              </label>
              <textarea
                rows={2}
                value={agentSystemMessage}
                onChange={(e) => setAgentSystemMessage(e.target.value)}
                placeholder="Override the system prompt for all requests routed through this combo…"
                className="w-full text-xs py-1.5 px-2 rounded border border-black/10 dark:border-white/10 bg-transparent focus:border-primary focus:outline-none resize-none"
              />
              <p className="text-[10px] text-text-muted mt-0.5">
                Replaces any system message sent by the client. Leave empty to pass through client
                system messages.
              </p>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div>
                <label className="text-[11px] font-medium text-text-muted block">
                  Require tool-calling models
                </label>
                <p className="text-[10px] text-text-muted">
                  When the request includes tools, skip combo entries that do not support tool
                  calling (priority / weighted / round-robin, etc.).
                </p>
              </div>
              <input
                type="checkbox"
                checked={requireToolCalling}
                onChange={(e) => setRequireToolCalling(e.target.checked)}
                className="accent-primary shrink-0"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-text-muted block mb-0.5">
                Tool Filter Regex
              </label>
              <input
                type="text"
                value={agentToolFilter}
                onChange={(e) => setAgentToolFilter(e.target.value)}
                placeholder="e.g. ^(bash|computer)$"
                className="w-full text-xs py-1.5 px-2 rounded border border-black/10 dark:border-white/10 bg-transparent focus:border-primary focus:outline-none font-mono"
              />
              <p className="text-[10px] text-text-muted mt-0.5">
                Only tools whose name matches this regex are forwarded to the provider. Leave empty
                to forward all tools.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-medium text-text-muted block mb-0.5">
                  Context Length
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={contextLength}
                  onChange={(e) => setContextLength(e.target.value)}
                  placeholder={COMBO_CONTEXT_LENGTH_FIELD.fallback.toLocaleString("en-US")}
                  className="w-full text-xs py-1.5 px-2 rounded border border-black/10 dark:border-white/10 bg-transparent focus:border-primary focus:outline-none font-mono"
                />
                {!parsedContextLength.ok && (
                  <p className="text-[10px] text-red-500 mt-0.5">{parsedContextLength.error}</p>
                )}
              </div>

              <div>
                <label className="text-[11px] font-medium text-text-muted block mb-0.5">
                  Max Output Tokens
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={maxOutputTokens}
                  onChange={(e) => setMaxOutputTokens(e.target.value)}
                  placeholder={COMBO_MAX_OUTPUT_TOKENS_FIELD.fallback.toLocaleString("en-US")}
                  className="w-full text-xs py-1.5 px-2 rounded border border-black/10 dark:border-white/10 bg-transparent focus:border-primary focus:outline-none font-mono"
                />
                {!parsedMaxOutputTokens.ok && (
                  <p className="text-[10px] text-red-500 mt-0.5">{parsedMaxOutputTokens.error}</p>
                )}
              </div>

              <p className="text-[10px] text-text-muted col-span-2 -mt-1">
                What this combo reports to clients in /v1/models. A combo routes across several
                models, so these describe the combo, not any one member — set them to what every
                member can honour. Leave empty for the defaults shown.
              </p>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div>
                <label className="text-[11px] font-medium text-text-muted block">
                  Context Cache Protection
                </label>
                <p className="text-[10px] text-text-muted">
                  Pins the provider/model across turns to preserve cache sessions. Internal tags are
                  stripped before forwarding to the provider.
                </p>
              </div>
              <input
                type="checkbox"
                checked={agentContextCache}
                onChange={(e) => setAgentContextCache(e.target.checked)}
                className="accent-primary shrink-0"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button onClick={onClose} variant="ghost" fullWidth size="sm">
              {tc("cancel")}
            </Button>
            <Button
              data-testid="combo-form-submit"
              onClick={handleSave}
              fullWidth
              size="sm"
              disabled={saveBlocked}
            >
              {saving ? t("saving") : isEdit ? tc("save") : t("createCombo")}
            </Button>
          </div>
        </div>
      </Modal>

      <ModelSelectModal
        isOpen={showModelSelect}
        onClose={() => setShowModelSelect(false)}
        onSelect={handleToggleModel}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title={t("addModelToCombo")}
        selectedModel={null}
        addedModelValues={models.map((m) => m.model)}
        modelEfforts={modelEfforts.efforts}
        onEffortChange={modelEfforts.setEffort}
        multiSelect
        // Both components are MOUNTED at once. Passing the derived data down keeps the
        // picker's own hook short-circuited, so the fetch set runs once per session
        // instead of twice — and the template resolver and the picker cannot disagree.
        groups={availableGroups}
        models={availableModels}
        combos={pickerCombos}
      />
    </>
  );
}
