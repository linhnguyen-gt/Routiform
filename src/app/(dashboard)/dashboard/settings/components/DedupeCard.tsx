"use client";

import { useEffect, useState } from "react";
import { Card, Button } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";
import { useTranslations } from "next-intl";

type Mode = "off" | "shadow" | "enforce";

interface DedupeConfig {
  enabled: boolean;
  mode: Mode;
  ttlMs: number;
  maxTemperatureForDedup: number;
}

interface DedupeCounters {
  shadowWouldHaveBlocked: number;
  inflightHits: number;
  bypassReasons: Record<string, number>;
  idempotencyKeyHits: number;
  cloneFailures: number;
  messageCollapsed: number;
  messageCollapseRequests: number;
}

const DEFAULT_CONFIG: DedupeConfig = {
  enabled: true,
  mode: "enforce",
  ttlMs: 2000,
  maxTemperatureForDedup: 1.0,
};

export default function DedupeCard() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const notify = useNotificationStore((s) => s.addNotification);

  const [config, setConfig] = useState<DedupeConfig>(DEFAULT_CONFIG);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<DedupeConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [counters, setCounters] = useState<DedupeCounters | null>(null);

  const loadConfig = async () => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const json = await res.json();
      if (json?.dedupeConfig) {
        const merged: DedupeConfig = {
          ...DEFAULT_CONFIG,
          ...json.dedupeConfig,
        };
        setConfig(merged);
        setDraft(merged);
      }
    } catch {
      /* ignore */
    }
  };

  const loadCounters = async () => {
    try {
      const res = await fetch("/api/settings/dedupe-stats", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.counters) setCounters(json.counters);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadConfig();
    loadCounters();
    const handle = setInterval(loadCounters, 10_000);
    return () => clearInterval(handle);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dedupeConfig: draft }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || "Failed to save dedupe settings");
      }
      setConfig(draft);
      setEditMode(false);
      notify({
        type: "success",
        title: "Saved",
        message: t("dedupeSaved"),
      });
    } catch (e) {
      notify({
        type: "error",
        title: tc("error"),
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-xl text-primary" aria-hidden="true">
              filter_alt
            </span>
            <h2 className="text-lg font-bold">{t("dedupeTitle")}</h2>
          </div>
          {editMode ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setDraft(config);
                  setEditMode(false);
                }}
              >
                {tc("cancel")}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : tc("save")}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setEditMode(true)}>
              {tc("edit")}
            </Button>
          )}
        </div>

        <p className="text-sm text-text-muted mb-4">{t("dedupeDescription")}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Mode */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-muted">{t("dedupeMode")}</label>
            {editMode ? (
              <select
                value={draft.mode}
                onChange={(e) => setDraft({ ...draft, mode: e.target.value as Mode })}
                className="bg-background border border-border rounded px-3 py-2 text-sm"
              >
                <option value="off">{t("dedupeModeOff")}</option>
                <option value="shadow">{t("dedupeModeShadow")}</option>
                <option value="enforce">{t("dedupeModeEnforce")}</option>
              </select>
            ) : (
              <span className="text-sm font-mono">{config.mode}</span>
            )}
          </div>

          {/* Enabled */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-muted">{t("dedupeEnabled")}</label>
            {editMode ? (
              <div className="flex items-center gap-2 py-2">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                />
                <span className="text-sm">{draft.enabled ? "On" : "Off"}</span>
              </div>
            ) : (
              <span className="text-sm">{config.enabled ? "On" : "Off"}</span>
            )}
          </div>

          {/* TTL */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-muted">{t("dedupeTtl")}</label>
            {editMode ? (
              <input
                type="range"
                min={500}
                max={5000}
                step={100}
                value={draft.ttlMs}
                onChange={(e) => setDraft({ ...draft, ttlMs: Number(e.target.value) })}
              />
            ) : null}
            <span className="text-sm font-mono">{editMode ? draft.ttlMs : config.ttlMs}ms</span>
          </div>

          {/* Max temperature */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-muted">{t("dedupeMaxTemp")}</label>
            {editMode ? (
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={draft.maxTemperatureForDedup}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    maxTemperatureForDedup: Number(e.target.value),
                  })
                }
                className="bg-background border border-border rounded px-3 py-2 text-sm"
              />
            ) : (
              <span className="text-sm font-mono">{config.maxTemperatureForDedup}</span>
            )}
          </div>
        </div>

        {/* Counters */}
        {counters && (
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label={t("dedupeStatInflight")} value={counters.inflightHits} />
            <Stat label={t("dedupeStatShadow")} value={counters.shadowWouldHaveBlocked} />
            <Stat label={t("dedupeStatMessages")} value={counters.messageCollapsed} />
            <Stat label={t("dedupeStatIdem")} value={counters.idempotencyKeyHits} />
          </div>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col p-3 rounded border border-border">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="text-base font-semibold font-mono">{value}</span>
    </div>
  );
}
