"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/shared/components";
import ModelSelectModal from "@/shared/components/ModelSelectModal";
import { DEFAULT_MODEL_EFFORT, type ModelEffort } from "@/shared/constants/reasoning-effort";
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
   * Writes one model's effort straight away, the same as every other picker in the app.
   * There is no separate confirm step: a control that shows the new value but only queues
   * it reads as saved, and the queue was lost whenever the surface closed.
   */
  const saveDefault = useCallback(async (providerModel: string, effort: ModelEffort) => {
    const slash = providerModel.indexOf("/");
    if (slash <= 0 || slash >= providerModel.length - 1) {
      showError();
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/settings/model-defaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerModel.slice(0, slash),
          model: providerModel.slice(slash + 1),
          effort,
        }),
      });
      if (!res.ok) throw new Error("Failed to update default");
      applySnapshot((await res.json()) as DefaultsResponse);
      showSaved();
    } catch {
      showError();
    } finally {
      setSaving(false);
    }
  }, []);

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

  const addedModelValues = useMemo(() => Object.keys(customByPickerKey), [customByPickerKey]);
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
        <button
          type="button"
          onClick={() => setShowModelSelect(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-surface px-3 py-2 text-sm text-text-muted hover:text-indigo-300 hover:border-indigo-500/50 transition-all"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Select model(s)
        </button>
        <p className="mt-2 text-xs text-text-muted">
          Tip: set each model&apos;s effort on its chip in the picker. Every change saves as you
          make it; picking a model with no default yet gives it {DEFAULT_MODEL_EFFORT}.
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
        // Clicking the name toggles the default itself: on for a model that has none,
        // off for one that does. That mirrors the chip list below, where a click removes.
        onSelect={(model) => {
          const value = String(model?.value ?? model?.id ?? "").trim();
          if (!value.includes("/")) {
            showError();
            return;
          }
          if (customByPickerKey[value]) removeDefault(value);
          else saveDefault(value, DEFAULT_MODEL_EFFORT);
        }}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title="Select Model(s)"
        selectedModel=""
        addedModelValues={addedModelValues}
        // Same key space as the picker's model values; anything else shows as "inherit".
        modelEfforts={customByPickerKey}
        onEffortChange={saveDefault}
        multiSelect
      />
    </Card>
  );
}
