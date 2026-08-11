"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/shared/components";
import ModelEffortSelect from "@/shared/components/ModelEffortSelect";
import ModelSelectModal from "@/shared/components/ModelSelectModal";
import {
  DEFAULT_MODEL_EFFORT,
  isModelEffort,
  type ModelEffort,
} from "@/shared/constants/reasoning-effort";
import { rekeyProviderModelMap, toPickerProviderModelKey } from "@/shared/models/model-string";
import type { ProviderConnection } from "@/shared/models/provider-connection";

type DefaultsResponse = {
  builtIn?: Record<string, string>;
  custom?: Record<string, string>;
  effective?: Record<string, string>;
};

function sortEntries(map: Record<string, string>): Array<[string, string]> {
  return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
}

function effortChipClass(effort: string): string {
  if (effort === "max" || effort === "xhigh" || effort === "high") {
    return "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30";
  }
  if (effort === "medium") {
    return "bg-indigo-500/15 text-indigo-300 border-indigo-500/30";
  }
  if (effort === "low") {
    return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  }
  return "bg-slate-500/15 text-slate-300 border-slate-500/30";
}

export default function ModelDefaultsTab() {
  const [builtIn, setBuiltIn] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [effective, setEffective] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const [pendingModels, setPendingModels] = useState<string[]>([]);
  // Effort per pending model, editable both in the picker and on the chip below it.
  const [pendingEfforts, setPendingEfforts] = useState<Record<string, ModelEffort>>({});
  const [activeProviders, setActiveProviders] = useState<ProviderConnection[]>([]);
  // Same store the CLI tool cards and the combo form feed the picker, so all of them list
  // the same models — alias-only entries included.
  const [modelAliases, setModelAliases] = useState<Record<string, string>>({});
  const [showModelSelect, setShowModelSelect] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings/model-defaults").then((res) => res.json() as Promise<DefaultsResponse>),
      fetch("/api/providers")
        .then((res) => (res.ok ? res.json() : { connections: [] }))
        .then((data) => (Array.isArray(data?.connections) ? data.connections : []))
        .catch(() => [] as Array<Record<string, unknown>>),
      fetch("/api/models/alias")
        .then((res) => (res.ok ? res.json() : { aliases: {} }))
        .then((data) => (data?.aliases as Record<string, string>) || {})
        .catch(() => ({}) as Record<string, string>),
    ])
      .then(([data, providers, aliases]) => {
        setBuiltIn(data.builtIn || {});
        setCustom(data.custom || {});
        setEffective(data.effective || {});
        setActiveProviders(providers);
        setModelAliases(aliases);
      })
      .finally(() => setLoading(false));
  }, []);

  const applySnapshot = (data: DefaultsResponse) => {
    setBuiltIn(data.builtIn || {});
    setCustom(data.custom || {});
    setEffective(data.effective || {});
  };

  const showSaved = () => {
    setStatus("saved");
    setTimeout(() => setStatus(""), 2000);
  };

  const showError = () => {
    setStatus("error");
    setTimeout(() => setStatus(""), 2500);
  };

  /**
   * `custom` arrives keyed by canonical provider id; the picker keys everything by the
   * alias it puts in its model values. Anything compared against a picker value has to go
   * through this map or it silently misses.
   */
  const customByPickerKey = useMemo(
    () => rekeyProviderModelMap(custom, toPickerProviderModelKey),
    [custom]
  );

  /**
   * Effort a newly picked model starts at: its own custom default when it has one, else
   * the fallback. Only `custom` is consulted — a lookup against `builtIn`/`effective`
   * would show a model as configured when nothing has been set, and then overwrite the
   * built-in default on Apply.
   */
  const initialEffortFor = (providerModel: string): ModelEffort => {
    const current = customByPickerKey[providerModel];
    return isModelEffort(current) ? current : DEFAULT_MODEL_EFFORT;
  };

  const togglePendingModel = (providerModel: string) => {
    const isRemoving = pendingModels.includes(providerModel);
    setPendingModels((prev) =>
      isRemoving ? prev.filter((item) => item !== providerModel) : [...prev, providerModel]
    );
    setPendingEfforts((prev) => {
      if (isRemoving) {
        const next = { ...prev };
        delete next[providerModel];
        return next;
      }
      return prev[providerModel]
        ? prev
        : { ...prev, [providerModel]: initialEffortFor(providerModel) };
    });
  };

  const setPendingEffort = (providerModel: string, effort: ModelEffort) => {
    setPendingEfforts((prev) => ({ ...prev, [providerModel]: effort }));
  };

  const addDefault = async () => {
    if (pendingModels.length === 0) return;

    // Only the models just picked. Sending the stored map back alongside them would
    // revert any default changed elsewhere since this tab loaded.
    const added: Record<string, string> = {};
    for (const providerModel of pendingModels) {
      if (providerModel.includes("/")) {
        added[providerModel] = pendingEfforts[providerModel] ?? DEFAULT_MODEL_EFFORT;
      }
    }

    setSaving(true);
    try {
      const res = await fetch("/api/settings/model-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaults: added }),
      });
      if (!res.ok) throw new Error("Failed to update defaults");
      const data = (await res.json()) as DefaultsResponse;
      applySnapshot(data);
      setPendingModels([]);
      setPendingEfforts({});
      showSaved();
    } catch {
      showError();
    } finally {
      setSaving(false);
    }
  };

  const removeDefault = async (providerModel: string) => {
    const slash = providerModel.indexOf("/");
    if (slash <= 0 || slash >= providerModel.length - 1) return;
    const provider = providerModel.slice(0, slash);
    const model = providerModel.slice(slash + 1);

    setSaving(true);
    try {
      const res = await fetch("/api/settings/model-defaults", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model }),
      });
      if (!res.ok) throw new Error("Failed to remove default");
      const data = (await res.json()) as DefaultsResponse;
      applySnapshot(data);
      showSaved();
    } catch {
      showError();
    } finally {
      setSaving(false);
    }
  };

  const customEntries = useMemo(() => sortEntries(custom), [custom]);
  const builtInEntries = useMemo(() => sortEntries(builtIn), [builtIn]);
  const effectiveEntries = useMemo(() => sortEntries(effective), [effective]);

  if (loading) {
    return (
      <Card>
        <div className="text-sm text-text-muted">Loading model defaults...</div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
            tune
          </span>
        </div>
        <div>
          <h3 className="text-lg font-semibold">Model Defaults</h3>
          <p className="text-sm text-text-muted">
            Set model-level fallback reasoning effort when the client does not send one.
          </p>
        </div>
        {status === "saved" && (
          <span className="ml-auto text-xs font-medium text-emerald-500 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">check_circle</span> Saved
          </span>
        )}
        {status === "error" && (
          <span className="ml-auto text-xs font-medium text-red-500 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">error</span> Failed
          </span>
        )}
      </div>

      <div className="p-4 rounded-lg bg-surface/30 border border-border/30 mb-4">
        <p className="text-sm font-medium mb-3">Add or update custom default</p>
        <div className="space-y-2">
          <div className="min-h-[40px] px-2 py-1.5 rounded-lg bg-surface border border-border/50 text-left hover:border-indigo-500/50 focus-within:border-indigo-500/50">
            <div className="flex flex-wrap items-center gap-1.5">
              {pendingModels.map((model) => (
                <span
                  key={model}
                  className="inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 text-[11px] text-indigo-300"
                >
                  <span className="max-w-[180px] truncate pl-2 pr-1">{model}</span>
                  <ModelEffortSelect
                    modelValue={model}
                    value={pendingEfforts[model] ?? DEFAULT_MODEL_EFFORT}
                    onChange={(effort) => setPendingEffort(model, effort)}
                    className="rounded-full"
                    colorClass="border-indigo-500/30 bg-transparent text-indigo-300 hover:text-indigo-200"
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${model}`}
                    onClick={() => togglePendingModel(model)}
                    className="px-1.5 py-0.5 hover:text-red-400"
                  >
                    <span className="material-symbols-outlined text-[12px]">close</span>
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => setShowModelSelect(true)}
                className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-surface px-2 py-0.5 text-[11px] text-text-muted hover:text-indigo-300 hover:border-indigo-500/40"
              >
                <span className="material-symbols-outlined text-[12px]">add</span>
                {pendingModels.length > 0 ? "Add more" : "Select model(s)"}
              </button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
            <button
              onClick={addDefault}
              disabled={saving || pendingModels.length === 0}
              className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 disabled:opacity-50 transition-all"
            >
              Apply
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Tip: pick several models and set each one&apos;s effort in the picker or on its chip, then
          Apply once.
        </p>
      </div>

      {customEntries.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
            Custom defaults
          </p>
          <div className="flex flex-wrap gap-2">
            {customEntries.map(([providerModel, effort]) => (
              <button
                key={providerModel}
                type="button"
                onClick={() => removeDefault(providerModel)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-surface/70 px-2.5 py-1 text-xs hover:border-red-500/40 hover:bg-red-500/10 transition-all disabled:opacity-50"
                title="Remove default"
              >
                <code className="text-indigo-300">{providerModel}</code>
                <span
                  className={`px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${effortChipClass(effort)}`}
                >
                  {effort}
                </span>
                <span className="material-symbols-outlined text-[14px] text-text-muted">close</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <details className="group mb-3">
        <summary className="text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer flex items-center gap-1 mb-2">
          <span className="material-symbols-outlined text-[14px] group-open:rotate-90 transition-transform">
            chevron_right
          </span>
          Effective defaults ({effectiveEntries.length})
        </summary>
        <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto rounded-lg border border-border/30 p-2">
          {effectiveEntries.map(([providerModel, effort]) => (
            <div
              key={providerModel}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/30 bg-surface/50 px-2.5 py-1 opacity-80"
            >
              <code className="text-xs text-indigo-300/80">{providerModel}</code>
              <span
                className={`px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${effortChipClass(effort)}`}
              >
                {effort}
              </span>
            </div>
          ))}
        </div>
      </details>

      <details className="group">
        <summary className="text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer flex items-center gap-1 mb-2">
          <span className="material-symbols-outlined text-[14px] group-open:rotate-90 transition-transform">
            chevron_right
          </span>
          Built-in defaults ({builtInEntries.length})
        </summary>
        <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto rounded-lg border border-border/30 p-2">
          {builtInEntries.map(([providerModel, effort]) => (
            <div
              key={providerModel}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/30 bg-surface/50 px-2.5 py-1 opacity-60"
            >
              <code className="text-xs text-indigo-300/60">{providerModel}</code>
              <span
                className={`px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${effortChipClass(effort)}`}
              >
                {effort}
              </span>
              <span className="material-symbols-outlined text-[14px] text-text-muted">lock</span>
            </div>
          ))}
        </div>
      </details>

      <ModelSelectModal
        isOpen={showModelSelect}
        onClose={() => setShowModelSelect(false)}
        onSelect={(model) => {
          const value = String(model?.value ?? model?.id ?? "").trim();
          if (!value.includes("/")) {
            showError();
            return;
          }
          togglePendingModel(value);
        }}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title="Select Model(s)"
        selectedModel=""
        addedModelValues={pendingModels}
        // Same key space as the picker's model values; anything else shows as "inherit".
        modelEfforts={{ ...customByPickerKey, ...pendingEfforts }}
        onEffortChange={(modelValue, effort) => {
          setPendingEffort(modelValue, effort);
          if (!pendingModels.includes(modelValue)) togglePendingModel(modelValue);
        }}
        multiSelect
      />
    </Card>
  );
}
