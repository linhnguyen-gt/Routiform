"use client";

import { Button, Card, CardSkeleton, Modal, ProxyConfigModal } from "@/shared/components";
import ModelRoutingSection from "@/shared/components/ModelRoutingSection";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useNotificationStore } from "@/store/notificationStore";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { ComboCard } from "./components/ComboCard";
import { ComboFormModal } from "./components/ComboFormModal";
import type {
  ComboMetrics,
  ComboRecord,
  ComboTestResults,
  ProviderConnection,
  ProviderNode,
} from "./components/combo-types";
import { ComboUsageGuide } from "./components/ComboUsageGuide";
import { TestResultsView } from "./components/TestResultsView";
import { COMBO_USAGE_GUIDE_STORAGE_KEY } from "./components/combo-constants";
import { getI18nOrFallback } from "./components/combo-utils";

/**
 * `warnings` is a transient per-request diagnostic the save routes attach only when
 * non-empty. A body that is not JSON, or has no warnings, is not an error.
 */
async function readWarnings(res: Response): Promise<string[]> {
  try {
    const body = await res.json();
    const warnings = (body as { warnings?: unknown })?.warnings;
    return Array.isArray(warnings)
      ? warnings.filter((w): w is string => typeof w === "string")
      : [];
  } catch {
    return [];
  }
}

/** Provider refs behind a set of warned `provider/model` strings, in first-seen order. */
function warnedProvidersOf(warnings: string[]): string[] {
  const providers: string[] = [];
  for (const warning of warnings) {
    const ref = warning.split("/")[0]?.trim();
    if (ref && !providers.includes(ref)) providers.push(ref);
  }
  return providers;
}

export default function CombosPage() {
  const t = useTranslations("combos");
  const tc = useTranslations("common");
  const [combos, setCombos] = useState<ComboRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCombo, setEditingCombo] = useState<ComboRecord | null>(null);
  const [activeProviders, setActiveProviders] = useState<ProviderConnection[]>([]);
  const [metrics, setMetrics] = useState<Record<string, ComboMetrics>>({});
  const [testResults, setTestResults] = useState<ComboTestResults | null>(null);
  const [testingCombo, setTestingCombo] = useState<string | null>(null);
  const [testComboName, setTestComboName] = useState("");
  const { copied, copy } = useCopyToClipboard();
  const notify = useNotificationStore();
  const [proxyTargetCombo, setProxyTargetCombo] = useState<ComboRecord | null>(null);
  const [proxyConfig, setProxyConfig] = useState<Record<string, unknown> | null>(null);
  const [providerNodes, setProviderNodes] = useState<ProviderNode[]>([]);
  const [showUsageGuide, setShowUsageGuide] = useState(true);
  const [recentlyCreatedCombo, setRecentlyCreatedCombo] = useState("");
  const [liveRegionText, setLiveRegionText] = useState("");
  const [comboDragIndex, setComboDragIndex] = useState<number | null>(null);
  const [comboDragOverIndex, setComboDragOverIndex] = useState<number | null>(null);
  const combosRef = useRef(combos);
  combosRef.current = combos;
  const activeComboCount = combos.filter((combo) => combo.isActive !== false).length;

  useEffect(() => {
    fetchData();
    fetch("/api/settings/proxy")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => setProxyConfig(c))
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      if (globalThis.localStorage?.getItem(COMBO_USAGE_GUIDE_STORAGE_KEY) === "1") {
        setShowUsageGuide(false);
      }
    } catch {
      // Ignore storage access errors (privacy mode / restricted environments)
    }
  }, []);

  const fetchData = async () => {
    try {
      const [combosRes, providersRes, metricsRes, nodesRes] = await Promise.all([
        fetch("/api/combos"),
        fetch("/api/providers"),
        fetch("/api/combos/metrics"),
        fetch("/api/provider-nodes"),
      ]);
      const combosData = await combosRes.json();
      const providersData = await providersRes.json();
      const metricsData = await metricsRes.json();
      const nodesData = nodesRes.ok ? await nodesRes.json() : { nodes: [] };

      if (combosRes.ok) setCombos(combosData.combos || []);
      if (providersRes.ok) {
        // Match 9router: show all connections in Add Model — new keys are often testStatus "unknown"
        // until the user runs Test; filtering to active/success hid OpenRouter and other API-key providers.
        setActiveProviders(providersData.connections || []);
      }
      if (metricsRes.ok) setMetrics(metricsData.metrics || {});
      setProviderNodes(nodesData.nodes || []);
    } catch (error) {
      console.log("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Exactly one toast, however many warnings there are: `notify.warning` does not group or
   * de-duplicate, so an 8-model combo would otherwise stack 8 auto-dismissing toasts. The
   * copy says only what the validator knows — the model is absent from the *static* list we
   * ship, and may still work if the provider lists it live. Never "invalid".
   */
  const notifyModelWarnings = (warnings: string[]) => {
    if (warnings.length === 0) return;
    console.warn("[combos] saved with model warnings:", warnings);
    notify.warning(
      getI18nOrFallback(
        t,
        "saveModelsNotInCatalog",
        "{count} model(s) are not in the known model list for {providers}. They may still work if the provider offers them. Saved anyway.",
        { count: warnings.length, providers: warnedProvidersOf(warnings).join(", ") }
      )
    );
  };

  const handleCreate = async (data: Omit<ComboRecord, "id">) => {
    try {
      const res = await fetch("/api/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        // Close modal and surface quick-test CTA immediately — do not block on fetchData().
        // Otherwise a slow or stuck refresh keeps the dialog open and breaks E2E/UX.
        setShowCreateModal(false);
        setRecentlyCreatedCombo(data.name?.trim() || "");
        notify.success(t("comboCreated"));
        notifyModelWarnings(await readWarnings(res));
        await fetchData();
      } else {
        const err = await res.json();
        notify.error(err.error?.message || err.error || t("failedCreate"));
      }
    } catch (_error) {
      notify.error(t("errorCreating"));
    }
  };

  const handleUpdate = async (id: string, data: Partial<ComboRecord>) => {
    try {
      const res = await fetch(`/api/combos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const warnings = await readWarnings(res);
        await fetchData();
        setEditingCombo(null);
        notify.success(t("comboUpdated"));
        notifyModelWarnings(warnings);
      } else {
        const err = await res.json();
        notify.error(err.error?.message || err.error || t("failedUpdate"));
      }
    } catch (_error) {
      notify.error(t("errorUpdating"));
    }
  };

  const handleComboDragStart = (e: React.DragEvent, index: number) => {
    setComboDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
    const el = e.currentTarget as HTMLElement | null;
    if (el)
      setTimeout(() => {
        if (el.isConnected) el.style.opacity = "0.5";
      }, 0);
  };

  const handleComboDragEnd = (e: React.DragEvent) => {
    const el = e.currentTarget as HTMLElement | null;
    if (el) el.style.opacity = "1";
    setComboDragIndex(null);
    setComboDragOverIndex(null);
  };

  const handleComboDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setComboDragOverIndex(index);
  };

  const moveCombo = useCallback(
    async (fromIndex: number, toIndex: number) => {
      const currentCombos = combosRef.current;
      if (
        fromIndex < 0 ||
        fromIndex >= currentCombos.length ||
        toIndex < 0 ||
        toIndex >= currentCombos.length ||
        fromIndex === toIndex
      ) {
        return;
      }

      const originalCombos = [...currentCombos];

      const reordered = [...currentCombos];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      setCombos(reordered);
      setComboDragIndex(null);
      setComboDragOverIndex(null);

      const comboName = originalCombos[fromIndex].name;
      setLiveRegionText(
        t("comboMoved", {
          name: comboName,
          from: fromIndex + 1,
          to: toIndex + 1,
          defaultValue: `${comboName} moved from position ${fromIndex + 1} to position ${toIndex + 1}`,
        })
      );

      try {
        const res = await fetch("/api/combos/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: reordered.map((c) => c.id) }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.updated === 0) throw new Error("No combos updated");
      } catch {
        setCombos(originalCombos);
        notify.error(t("errorUpdating"));
      }
    },
    [notify, t]
  );

  const handleComboDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const fromIndex = comboDragIndex;
    if (fromIndex === null || fromIndex === dropIndex) {
      setComboDragIndex(null);
      setComboDragOverIndex(null);
      return;
    }

    await moveCombo(fromIndex, dropIndex);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/combos/${id}`, { method: "DELETE" });
      if (res.ok) {
        setCombos(combos.filter((c) => c.id !== id));
        notify.success(t("comboDeleted"));
      }
    } catch (_error) {
      notify.error(t("errorDeleting"));
    }
  };

  const handleDuplicate = async (combo: ComboRecord) => {
    const baseName = combo.name.replace(/-copy(-\d+)?$/, "");
    const existingNames = combos.map((c) => c.name);
    let newName = `${baseName}-copy`;
    let counter = 1;
    while (existingNames.includes(newName)) {
      counter++;
      newName = `${baseName}-copy-${counter}`;
    }

    const data = {
      name: newName,
      models: combo.models,
      strategy: combo.strategy || "priority",
      config: combo.config || {},
    };

    await handleCreate(data);
  };

  const handleTestCombo = async (combo: { name: string }) => {
    setTestingCombo(combo.name);
    setTestComboName(combo.name);
    setTestResults(null);
    try {
      const res = await fetch("/api/combos/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comboName: combo.name }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await res.json().catch(() => ({ error: t("testFailed") }));
      if (!res.ok) {
        setTestResults({ error: data?.error || t("testFailed") });
        notify.error(t("testFailed"));
        return;
      }
      setTestResults(data || { error: t("testFailed") });
    } catch (_error) {
      setTestResults({ error: t("testFailed") });
      notify.error(t("testFailed"));
    } finally {
      setTestingCombo(null);
    }
  };

  const handleToggleCombo = async (combo: ComboRecord) => {
    const newActive = combo.isActive === false ? true : false;
    setCombos((prev) => prev.map((c) => (c.id === combo.id ? { ...c, isActive: newActive } : c)));
    try {
      await fetch(`/api/combos/${combo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: newActive }),
      });
    } catch (_error) {
      setCombos((prev) =>
        prev.map((c) => (c.id === combo.id ? { ...c, isActive: !newActive } : c))
      );
      notify.error(t("failedToggle"));
    }
  };

  const handleHideUsageGuideForever = () => {
    setShowUsageGuide(false);
    try {
      globalThis.localStorage?.setItem(COMBO_USAGE_GUIDE_STORAGE_KEY, "1");
    } catch {}
  };

  const handleShowUsageGuide = () => {
    setShowUsageGuide(true);
    try {
      globalThis.localStorage?.removeItem(COMBO_USAGE_GUIDE_STORAGE_KEY);
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Loading combos">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header with improved spacing and hierarchy */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {t("title")}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            {t("description")}
          </p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface/60 px-3 py-1.5 text-xs text-text-muted">
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              layers
            </span>
            <span>
              {getI18nOrFallback(t, "comboCountSummary", "{active} active of {total} combos", {
                active: activeComboCount,
                total: combos.length,
              })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap w-full sm:w-auto">
          {!showUsageGuide && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleShowUsageGuide}
              aria-label={getI18nOrFallback(t, "usageGuideShow", "Show guide")}
              className="flex-1 sm:flex-none"
            >
              {getI18nOrFallback(t, "usageGuideShow", "Show guide")}
            </Button>
          )}
          <Button
            data-testid="combos-header-create"
            icon="add"
            onClick={() => setShowCreateModal(true)}
            aria-label={t("createCombo")}
            className="flex-1 sm:flex-none"
          >
            {t("createCombo")}
          </Button>
        </div>
      </header>

      {showUsageGuide && (
        <ComboUsageGuide
          onHide={() => setShowUsageGuide(false)}
          onHideForever={handleHideUsageGuideForever}
        />
      )}

      {/* Success banner with improved contrast and accessibility */}
      {recentlyCreatedCombo && (
        <Card
          padding="sm"
          className="border-2 border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30"
          role="status"
          data-testid="quick-test-banner"
          aria-live="polite"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                {getI18nOrFallback(
                  t,
                  "quickTestTitle",
                  `Combo "${recentlyCreatedCombo}" ready to validate`
                )}
              </p>
              <code className="inline-block text-xs mt-1.5 px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-100 font-mono">
                {recentlyCreatedCombo}
              </code>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1.5">
                {getI18nOrFallback(
                  t,
                  "quickTestDescription",
                  "Run a test now to confirm fallback and latency behavior."
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap sm:flex-nowrap">
              <Button
                size="sm"
                variant="secondary"
                icon="play_arrow"
                onClick={() => {
                  handleTestCombo({ name: recentlyCreatedCombo });
                  setRecentlyCreatedCombo("");
                }}
                aria-label={`Test combo ${recentlyCreatedCombo}`}
                data-testid="quick-test-cta"
                className="flex-1 sm:flex-none"
              >
                {getI18nOrFallback(t, "testNow", "Test now")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRecentlyCreatedCombo("")}
                aria-label={tc("close")}
                className="flex-1 sm:flex-none"
              >
                {tc("close")}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveRegionText}
      </div>

      {combos.length > 1 && (
        <p id="combo-reorder-instructions" className="text-xs text-text-muted">
          {getI18nOrFallback(
            t,
            "reorderInstructions",
            "Drag to reorder, or focus a combo and use Arrow Up/Down, Home, or End."
          )}
        </p>
      )}

      <ModelRoutingSection combos={combos} />

      {/* Empty state with improved visual hierarchy */}
      {combos.length === 0 ? (
        <Card className="border border-dashed border-border-subtle bg-surface/60" padding="lg">
          <div className="mx-auto flex max-w-xl flex-col items-center text-center gap-3 py-3">
            <div className="rounded-xl border border-border-subtle bg-bg-secondary p-3">
              <span
                className="material-symbols-outlined text-3xl text-text-muted"
                aria-hidden="true"
              >
                account_tree
              </span>
            </div>
            <h2 className="text-lg font-semibold text-text-main">{t("noCombosYet")}</h2>
            <p className="text-sm text-text-muted leading-relaxed">{t("description")}</p>
            <Button
              icon="add"
              onClick={() => setShowCreateModal(true)}
              aria-label={t("createCombo")}
            >
              {t("createCombo")}
            </Button>
          </div>
        </Card>
      ) : (
        <div
          role="list"
          aria-label={t("comboList", { defaultValue: "Combos" })}
          aria-describedby={combos.length > 1 ? "combo-reorder-instructions" : undefined}
          className="flex flex-col gap-4"
        >
          {combos.map((combo, index) => (
            <div
              key={combo.id}
              draggable
              tabIndex={0}
              role="listitem"
              aria-roledescription="draggable combo"
              aria-grabbed={comboDragIndex === index}
              onDragStart={(e) => handleComboDragStart(e, index)}
              onDragEnd={handleComboDragEnd}
              onDragOver={(e) => handleComboDragOver(e, index)}
              onDrop={(e) => handleComboDrop(e, index)}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp" && index > 0) {
                  e.preventDefault();
                  moveCombo(index, index - 1);
                } else if (e.key === "ArrowDown" && index < combos.length - 1) {
                  e.preventDefault();
                  moveCombo(index, index + 1);
                } else if (e.key === "Home") {
                  e.preventDefault();
                  if (index > 0) moveCombo(index, 0);
                } else if (e.key === "End") {
                  e.preventDefault();
                  if (index < combos.length - 1) moveCombo(index, combos.length - 1);
                }
              }}
              className={`transition-all duration-200 motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl ${
                comboDragOverIndex === index && comboDragIndex !== index
                  ? "ring-2 ring-blue-400 dark:ring-blue-500 motion-safe:scale-[1.02]"
                  : ""
              } ${comboDragIndex === index ? "opacity-50 motion-safe:scale-95" : ""}`}
            >
              <ComboCard
                combo={combo}
                metrics={metrics[combo.name]}
                providerNodes={providerNodes}
                copied={copied}
                onCopy={copy}
                onEdit={() => setEditingCombo(combo)}
                onDelete={() => handleDelete(combo.id)}
                onDuplicate={() => handleDuplicate(combo)}
                onTest={() => handleTestCombo(combo)}
                testing={testingCombo === combo.name}
                onProxy={() => setProxyTargetCombo(combo)}
                hasProxy={!!proxyConfig?.combos?.[combo.id]}
                onToggle={() => handleToggleCombo(combo)}
                onMoveUp={() => moveCombo(index, index - 1)}
                onMoveDown={() => moveCombo(index, index + 1)}
                canMoveUp={index > 0}
                canMoveDown={index < combos.length - 1}
              />
            </div>
          ))}
        </div>
      )}

      {testResults && (
        <Modal
          isOpen={!!testResults}
          onClose={() => {
            setTestResults(null);
            setTestingCombo(null);
            setTestComboName("");
          }}
          title={t("testResults", { name: testComboName || testingCombo || "" })}
        >
          <TestResultsView results={testResults} />
        </Modal>
      )}

      <ComboFormModal
        key="create"
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSave={handleCreate}
        activeProviders={activeProviders}
        combos={combos}
        combo={null}
      />

      <ComboFormModal
        key={editingCombo?.id || "new"}
        isOpen={!!editingCombo}
        combo={editingCombo}
        onClose={() => setEditingCombo(null)}
        onSave={(data) => handleUpdate(editingCombo.id, data)}
        activeProviders={activeProviders}
        combos={combos}
      />

      {proxyTargetCombo && (
        <ProxyConfigModal
          isOpen={!!proxyTargetCombo}
          onClose={() => setProxyTargetCombo(null)}
          level="combo"
          levelId={proxyTargetCombo.id}
          levelLabel={proxyTargetCombo.name}
        />
      )}
    </div>
  );
}
