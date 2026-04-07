"use client";

import { useState, useEffect } from "react";
import { Card, Input, Button } from "@/shared/components";
import FallbackChainsEditor from "./FallbackChainsEditor";
import {
  ROUTING_STRATEGIES,
  SETTINGS_FALLBACK_STRATEGY_VALUES,
} from "@/shared/constants/routingStrategies";
import { useTranslations } from "next-intl";

const STRATEGIES = ROUTING_STRATEGIES.filter((strategy) =>
  SETTINGS_FALLBACK_STRATEGY_VALUES.includes(strategy.value)
).map((strategy) => ({
  value: strategy.value,
  labelKey: strategy.labelKey,
  descKey: strategy.settingsDescKey,
  icon: strategy.icon,
}));

export default function RoutingTab() {
  const [settings, setSettings] = useState<any>({
    fallbackStrategy: "fill-first",
    alwaysPreserveClientCache: "auto",
  });
  const [loading, setLoading] = useState(true);
  const [aliases, setAliases] = useState([]);
  const [lkgpCacheLoading, setLkgpCacheLoading] = useState(false);
  const [lkgpCacheStatus, setLkgpCacheStatus] = useState({ type: "", message: "" });
  const [newPattern, setNewPattern] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [gfModel, setGfModel] = useState("");
  const [gfStatuses, setGfStatuses] = useState([502, 503]);
  const [gfSaving, setGfSaving] = useState(false);
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const strategyHintKeyByValue = STRATEGIES.reduce<Record<string, string>>((acc, strategy) => {
    acc[strategy.value] = strategy.descKey;
    return acc;
  }, {});

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings(data);
        setAliases(data.wildcardAliases || []);
        if (typeof data.globalFallbackModel === "string") {
          setGfModel(data.globalFallbackModel);
        } else {
          setGfModel("");
        }
        if (
          Array.isArray(data.globalFallbackStatusCodes) &&
          data.globalFallbackStatusCodes.length > 0
        ) {
          setGfStatuses([...data.globalFallbackStatusCodes].sort((a, b) => a - b));
        } else {
          setGfStatuses([502, 503]);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const updateSetting = async (patch) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...patch }));
      }
    } catch (err) {
      console.error("Failed to update settings:", err);
    }
  };

  const addAlias = async () => {
    if (!newPattern.trim() || !newTarget.trim()) return;
    const updated = [...aliases, { pattern: newPattern.trim(), target: newTarget.trim() }];
    await updateSetting({ wildcardAliases: updated });
    setAliases(updated);
    setNewPattern("");
    setNewTarget("");
  };

  const removeAlias = async (idx) => {
    const updated = aliases.filter((_, i) => i !== idx);
    await updateSetting({ wildcardAliases: updated });
    setAliases(updated);
  };

  const toggleGfStatus = (code) => {
    setGfStatuses((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code].sort((a, b) => a - b)
    );
  };

  const saveGlobalFallback = async () => {
    setGfSaving(true);
    try {
      const codes =
        gfStatuses.length > 0 ? [...new Set(gfStatuses)].sort((a, b) => a - b) : [502, 503];
      await updateSetting({
        globalFallbackModel: gfModel.trim() ? gfModel.trim() : null,
        globalFallbackStatusCodes: codes,
      });
    } catch (err) {
      console.error("Failed to save global combo fallback:", err);
    } finally {
      setGfSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Strategy Selection */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              route
            </span>
          </div>
          <h3 className="text-lg font-semibold">{t("routingStrategy")}</h3>
        </div>

        <div className="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
          <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
            {t("routingAdvancedGuideTitle")}
          </p>
          <p className="text-xs text-text-muted mt-1">{t("routingAdvancedGuideHint1")}</p>
          <p className="text-xs text-text-muted">{t("routingAdvancedGuideHint2")}</p>
        </div>

        <div
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 mb-4"
          style={{ gridAutoRows: "1fr" }}
        >
          {STRATEGIES.map((s) => (
            <button
              key={s.value}
              onClick={() => updateSetting({ fallbackStrategy: s.value })}
              disabled={loading}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border text-center transition-all ${
                settings.fallbackStrategy === s.value
                  ? "border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/20"
                  : "border-border/50 hover:border-border hover:bg-surface/30"
              }`}
            >
              <span
                className={`material-symbols-outlined text-[24px] ${
                  settings.fallbackStrategy === s.value ? "text-blue-400" : "text-text-muted"
                }`}
              >
                {s.icon}
              </span>
              <div>
                <p
                  className={`text-sm font-medium ${settings.fallbackStrategy === s.value ? "text-blue-400" : ""}`}
                >
                  {t(s.labelKey)}
                </p>
                <p className="text-xs text-text-muted mt-0.5">{t(s.descKey)}</p>
              </div>
            </button>
          ))}
        </div>

        {settings.fallbackStrategy === "round-robin" && (
          <div className="flex items-center justify-between pt-3 border-t border-border/30">
            <div>
              <p className="text-sm font-medium">{t("stickyLimit")}</p>
              <p className="text-xs text-text-muted">{t("stickyLimitDesc")}</p>
            </div>
            <Input
              type="number"
              min="1"
              max="10"
              value={settings.stickyRoundRobinLimit || 3}
              onChange={(e) => updateSetting({ stickyRoundRobinLimit: parseInt(e.target.value) })}
              disabled={loading}
              className="w-20 text-center"
            />
          </div>
        )}

        <p className="text-xs text-text-muted italic pt-3 border-t border-border/30 mt-3">
          {t(strategyHintKeyByValue[settings.fallbackStrategy] || "fillFirstDesc")}
        </p>
      </Card>

      {/* Adaptive Volume Routing */}
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 h-fit">
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                network_ping
              </span>
            </div>
            <div>
              <h3 className="text-lg font-semibold">
                {t("adaptiveVolumeRouting") || "Adaptive Volume Routing"}
              </h3>
              <p className="text-sm text-text-muted mt-1">
                {t("adaptiveVolumeRoutingDesc") ||
                  "Automatically adjusts traffic volume between providers based on real-time latency and error rates."}
              </p>
            </div>
          </div>
          <div className="pt-1">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={!!settings.adaptiveVolumeRouting}
                onChange={(e) => updateSetting({ adaptiveVolumeRouting: e.target.checked })}
                disabled={loading}
              />
              <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>
      </Card>

      {/* LKGP Toggle */}
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 h-fit">
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                verified
              </span>
            </div>
            <div>
              <h3 className="text-lg font-semibold">
                {t("lkgpToggleTitle") || "Last Known Good Provider (LKGP)"}
              </h3>
              <p className="text-sm text-text-muted mt-1">
                {t("lkgpToggleDesc") ||
                  "When enabled, the router remembers which provider last served a successful response and tries it first on subsequent requests."}
              </p>
            </div>
          </div>
          <div className="pt-1">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={settings.lkgpEnabled !== false}
                onChange={(e) => updateSetting({ lkgpEnabled: e.target.checked })}
                disabled={loading}
              />
              <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border/30 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            loading={lkgpCacheLoading}
            onClick={async () => {
              setLkgpCacheLoading(true);
              setLkgpCacheStatus({ type: "", message: "" });
              try {
                const res = await fetch("/api/settings/lkgp-cache", { method: "DELETE" });
                const data = await res.json();
                if (res.ok) {
                  setLkgpCacheStatus({
                    type: "success",
                    message: t("lkgpCacheCleared") || "LKGP cache cleared successfully",
                  });
                } else {
                  setLkgpCacheStatus({
                    type: "error",
                    message:
                      data.error || t("lkgpCacheClearFailed") || "Failed to clear LKGP cache",
                  });
                }
              } catch {
                setLkgpCacheStatus({
                  type: "error",
                  message: t("errorOccurred") || "An error occurred",
                });
              } finally {
                setLkgpCacheLoading(false);
              }
            }}
          >
            <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">
              delete_sweep
            </span>
            {t("clearLkgpCache") || "Clear LKGP Cache"}
          </Button>
          {lkgpCacheStatus.message && (
            <span
              className={`text-xs ${lkgpCacheStatus.type === "success" ? "text-green-500" : "text-red-500"}`}
            >
              {lkgpCacheStatus.message}
            </span>
          )}
        </div>
      </Card>

      {/* Wildcard Aliases */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              alt_route
            </span>
          </div>
          <div>
            <h3 className="text-lg font-semibold">{t("modelAliases")}</h3>
            <p className="text-sm text-text-muted">{t("modelAliasesDesc")}</p>
          </div>
        </div>

        {aliases.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-4">
            {aliases.map((a, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-surface/30 border border-border/20"
              >
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="font-mono text-purple-400 break-all">{a.pattern}</span>
                  <span className="material-symbols-outlined text-[14px] text-text-muted">
                    arrow_forward
                  </span>
                  <span className="font-mono text-text-main break-all">{a.target}</span>
                </div>
                <button
                  onClick={() => removeAlias(i)}
                  className="shrink-0 text-text-muted hover:text-red-400 transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
          <div className="flex-1">
            <Input
              label={t("pattern")}
              placeholder={t("aliasPatternPlaceholder")}
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Input
              label={t("targetModel")}
              placeholder={t("aliasTargetPlaceholder")}
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={addAlias}
            className="mb-[2px] sm:w-auto w-full"
          >
            {t("add")}
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-violet-500/10 text-violet-500">
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              backup
            </span>
          </div>
          <div>
            <h3 className="text-lg font-semibold">{t("globalComboFallbackTitle")}</h3>
            <p className="text-xs text-text-muted">{t("globalComboFallbackDesc")}</p>
          </div>
        </div>
        <div className="space-y-3">
          <Input
            label={t("globalFallbackModelLabel")}
            placeholder="e.g. openrouter/openai/gpt-4o-mini"
            value={gfModel}
            onChange={(e) => setGfModel(e.target.value)}
            disabled={loading}
          />
          <div>
            <p className="text-xs font-medium text-text-muted mb-2">
              {t("globalFallbackStatusLabel")}
            </p>
            <div className="flex flex-wrap gap-2">
              {[502, 503, 429, 504].map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleGfStatus(code)}
                  disabled={loading}
                  className={`px-2 py-1 rounded text-xs border transition-colors ${
                    gfStatuses.includes(code)
                      ? "border-violet-500/50 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                      : "border-border/50 text-text-muted hover:border-border"
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-text-muted mt-1">{t("globalFallbackStatusHint")}</p>
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={saveGlobalFallback}
            disabled={loading || gfSaving}
          >
            {gfSaving ? tc("loading") : t("saveGlobalFallback")}
          </Button>
        </div>
      </Card>

      {/* Fallback Chains */}
      <FallbackChainsEditor />

      {/* Client Cache Control */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              cached
            </span>
          </div>
          <div>
            <h3 className="text-lg font-semibold">Client Cache Control</h3>
            <p className="text-sm text-text-muted">
              Configure how client-side cache_control headers are handled
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {[
            {
              value: "auto",
              label: "Auto (Recommended)",
              desc: "Preserve cache_control for native Claude-compatible flows with deterministic routing; CC-compatible bridges use Routiform-managed markers",
            },
            {
              value: "always",
              label: "Always Preserve",
              desc: "Always forward client cache_control headers to upstream providers",
            },
            {
              value: "never",
              label: "Never Preserve",
              desc: "Always remove client cache_control headers, let Routiform manage caching",
            },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => updateSetting({ alwaysPreserveClientCache: option.value })}
              disabled={loading}
              className={`w-full flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-all ${
                settings.alwaysPreserveClientCache === option.value
                  ? "border-green-500/50 bg-green-500/5 ring-1 ring-green-500/20"
                  : "border-border/50 hover:border-border hover:bg-surface/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`material-symbols-outlined text-[16px] ${
                    settings.alwaysPreserveClientCache === option.value
                      ? "text-green-400"
                      : "text-text-muted"
                  }`}
                >
                  {settings.alwaysPreserveClientCache === option.value
                    ? "check_circle"
                    : "radio_button_unchecked"}
                </span>
                <span
                  className={`text-sm font-medium ${settings.alwaysPreserveClientCache === option.value ? "text-green-400" : ""}`}
                >
                  {option.label}
                </span>
              </div>
              <p className="text-xs text-text-muted ml-7">{option.desc}</p>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
