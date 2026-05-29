"use client";

import { useState, useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/utils/cn";
import { getActiveSidebarHref } from "@/shared/utils/sidebarRouteMatch";
import { APP_CONFIG } from "@/shared/constants/config";
import RoutiformLogo from "./RoutiformLogo";
import Button from "./Button";
import { ConfirmModal } from "./Modal";
import CloudSyncStatus from "./CloudSyncStatus";
import { useTranslations } from "next-intl";
import {
  HIDDEN_SIDEBAR_ITEMS_SETTING_KEY,
  SIDEBAR_SETTINGS_UPDATED_EVENT,
  SIDEBAR_SECTIONS,
  normalizeHiddenSidebarItems,
} from "@/shared/constants/sidebarVisibility";

export default function Sidebar({
  onClose,
  collapsed = false,
  onToggleCollapse,
}: {
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();
  const t = useTranslations("sidebar");
  const tc = useTranslations("common");
  const [showShutdownModal, setShowShutdownModal] = useState(false);
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [hiddenSidebarItems, setHiddenSidebarItems] = useState<string[]>([]);
  const [customAppName, setCustomAppName] = useState<string | null>(null);
  const [customLogo, setCustomLogo] = useState<string | null>(null);

  useEffect(() => {
    const applySettings = (data) => {
      setShowDebug(data?.debugMode === true);
      setHiddenSidebarItems(normalizeHiddenSidebarItems(data?.[HIDDEN_SIDEBAR_ITEMS_SETTING_KEY]));
      setCustomAppName(data?.instanceName || null);
      setCustomLogo(data?.customLogoBase64 || data?.customLogoUrl || null);
    };

    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => applySettings(data))
      .catch(() => {});

    const handleSettingsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail || {};

      if ("debugMode" in detail) {
        setShowDebug(detail.debugMode === true);
      }

      if (HIDDEN_SIDEBAR_ITEMS_SETTING_KEY in detail) {
        setHiddenSidebarItems(
          normalizeHiddenSidebarItems(detail[HIDDEN_SIDEBAR_ITEMS_SETTING_KEY])
        );
      }

      if ("instanceName" in detail) {
        setCustomAppName((detail.instanceName as string) || null);
      }

      if ("customLogoBase64" in detail) {
        setCustomLogo((detail.customLogoBase64 as string) || null);
      } else if ("customLogoUrl" in detail) {
        setCustomLogo((detail.customLogoUrl as string) || null);
      }
    };

    window.addEventListener(SIDEBAR_SETTINGS_UPDATED_EVENT, handleSettingsUpdated as EventListener);

    return () => {
      window.removeEventListener(
        SIDEBAR_SETTINGS_UPDATED_EVENT,
        handleSettingsUpdated as EventListener
      );
    };
  }, []);

  const handleShutdown = async () => {
    setIsShuttingDown(true);
    try {
      await fetch("/api/shutdown", { method: "POST" });
    } catch (_e) {
      // Expected to fail as server shuts down; ignore error
    }
    setIsShuttingDown(false);
    setShowShutdownModal(false);
    setIsDisconnected(true);
  };

  const handleRestart = async () => {
    setIsRestarting(true);
    try {
      await fetch("/api/restart", { method: "POST" });
    } catch (_e) {
      // Expected to fail as server restarts
    }
    setIsRestarting(false);
    setShowRestartModal(false);
    setIsDisconnected(true);
    setTimeout(() => {
      globalThis.location.reload();
    }, 3000);
  };

  const getSidebarLabel = (key: string, fallback: string) =>
    typeof t.has === "function" && t.has(key) ? t(key) : fallback;

  const hiddenSidebarSet = new Set(hiddenSidebarItems);
  const visibleSections = SIDEBAR_SECTIONS.filter(
    (section) => section.visibility !== "debug" || showDebug
  )
    .map((section) => ({
      ...section,
      title: getSidebarLabel(section.titleKey, section.titleFallback),
      items: section.items
        .map((item) => ({ ...item, label: t(item.i18nKey) }))
        .filter((item) => !hiddenSidebarSet.has(item.id)),
    }))
    .filter((section) => section.items.length > 0);

  const activeHref = useMemo(
    () =>
      getActiveSidebarHref(
        pathname,
        visibleSections.flatMap((section) => section.items)
      ),
    [pathname, visibleSections]
  );

  const renderNavLink = (item) => {
    const active = !item.external && activeHref === item.href;
    const className = cn(
      "group relative flex items-center gap-3 rounded-2xl border transition-all duration-200",
      collapsed ? "justify-center px-2 py-3" : "px-3.5 py-3",
      active
        ? "border-primary/20 bg-primary/10 text-primary shadow-[0_10px_30px_rgba(59,130,246,0.12)]"
        : "border-transparent text-text-muted hover:border-border/60 hover:bg-surface/70 hover:text-text-main"
    );
    const iconClassName = cn(
      "material-symbols-outlined text-[18px] transition-all duration-200",
      active ? "fill-1 text-primary" : "group-hover:text-primary group-hover:translate-x-0.5"
    );
    const content = (
      <>
        {!collapsed && (
          <span
            className={cn(
              "absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-r-full transition-opacity duration-200",
              active ? "bg-primary opacity-100" : "opacity-0"
            )}
            aria-hidden="true"
          />
        )}
        <span className={iconClassName}>{item.icon}</span>
        {!collapsed && (
          <span className={cn("text-sm font-medium", active ? "text-primary" : "text-current")}>
            {item.label}
          </span>
        )}
      </>
    );

    if (item.external) {
      return (
        <a
          key={item.href}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          title={collapsed ? item.label : undefined}
          className={className}
        >
          {content}
        </a>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClose}
        title={collapsed ? item.label : undefined}
        className={className}
      >
        {content}
      </Link>
    );
  };

  return (
    <>
      <aside
        className={cn(
          "flex h-full flex-col border-r border-black/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(248,250,252,0.94))] backdrop-blur-xl transition-all duration-300 ease-in-out dark:border-white/5 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.95),rgba(2,6,23,0.98))]",
          collapsed ? "w-16" : "w-72"
        )}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-3 focus:bg-primary focus:text-white focus:rounded-md focus:m-2"
        >
          Skip to content
        </a>
        <div
          className={cn(
            "flex items-center pt-4 pb-2",
            collapsed ? "justify-center px-3" : "justify-end px-5"
          )}
        >
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={cn(
                "rounded-xl border border-transparent p-2 text-text-muted/60 transition-colors hover:border-border/60 hover:bg-surface/70 hover:text-text-main",
                collapsed && "mt-2"
              )}
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                {collapsed ? "chevron_right" : "chevron_left"}
              </span>
            </button>
          )}
        </div>

        <div className={cn("py-4", collapsed ? "px-2" : "px-5")}>
          <Link
            href="/dashboard"
            className={cn(
              "group block rounded-[22px] border border-border/50 bg-white/70 p-3 shadow-[0_12px_36px_rgba(15,23,42,0.06)] transition-all duration-200 hover:border-border/70 hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)] dark:bg-white/[0.04] dark:shadow-none",
              collapsed ? "px-2.5 py-3" : ""
            )}
          >
            <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3")}>
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-[#2563EB] via-[#3B82F6] to-[#6366F1] shadow-[0_10px_25px_rgba(59,130,246,0.35)]">
                {customLogo ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={customLogo}
                      alt={customAppName || APP_CONFIG.name}
                      className="size-5 object-contain"
                    />
                  </>
                ) : (
                  <RoutiformLogo size={20} className="text-white" />
                )}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate text-base font-semibold tracking-tight text-text-main">
                      {customAppName || APP_CONFIG.name}
                    </h1>
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                      v{APP_CONFIG.version}
                    </span>
                  </div>
                  <span className="mt-1 block text-xs text-text-muted">Unified AI gateway</span>
                </div>
              )}
            </div>
          </Link>
        </div>

        <nav
          aria-label="Main navigation"
          className={cn(
            "custom-scrollbar flex-1 space-y-2 overflow-y-auto py-2",
            collapsed ? "px-2" : "px-3"
          )}
        >
          {visibleSections.map((section) => {
            const showTitle = section.showTitleInSidebar !== false;

            return (
              <div
                key={section.id}
                className={showTitle ? "mt-2 pt-4 first:mt-0 first:pt-0" : undefined}
              >
                {!collapsed && showTitle && (
                  <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-text-muted/70">
                    {section.title}
                  </p>
                )}
                {collapsed && showTitle && (
                  <div className="mx-1 mb-2 border-t border-black/5 dark:border-white/5" />
                )}
                {section.items.map(renderNavLink)}
              </div>
            );
          })}
        </nav>

        <CloudSyncStatus collapsed={collapsed} />

        <div
          className={cn(
            "border-t border-black/5 dark:border-white/5",
            collapsed ? "flex flex-col gap-2 p-2" : "p-3"
          )}
        >
          <div
            className={cn(
              "rounded-2xl border border-border/50 bg-white/60 shadow-[0_-4px_18px_rgba(15,23,42,0.04)] dark:bg-white/[0.03] dark:shadow-none",
              collapsed ? "p-1.5" : "grid grid-cols-2 gap-2 p-2"
            )}
          >
            <button
              type="button"
              onClick={() => setShowRestartModal(true)}
              title={t("restart")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border font-medium transition-all duration-200",
                "border-amber-500/20 text-amber-600 hover:border-amber-500/40 hover:bg-amber-500/10 dark:text-amber-400",
                collapsed ? "min-h-11 w-full px-0 py-2.5" : "min-h-11 px-3 py-2 text-sm"
              )}
            >
              <span className="material-symbols-outlined text-[18px]">restart_alt</span>
              {!collapsed && t("restart")}
            </button>
            <button
              type="button"
              onClick={() => setShowShutdownModal(true)}
              title={t("shutdown")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border font-medium transition-all duration-200",
                "border-red-500/20 text-red-600 hover:border-red-500/40 hover:bg-red-500/10 dark:text-red-400",
                collapsed ? "mt-2 min-h-11 w-full px-0 py-2.5" : "min-h-11 px-3 py-2 text-sm"
              )}
            >
              <span className="material-symbols-outlined text-[18px]">power_settings_new</span>
              {!collapsed && t("shutdown")}
            </button>
          </div>
        </div>
      </aside>

      <ConfirmModal
        isOpen={showShutdownModal}
        onClose={() => setShowShutdownModal(false)}
        onConfirm={handleShutdown}
        title={t("shutdown")}
        message={t("shutdownConfirm")}
        confirmText={t("shutdown")}
        cancelText={tc("cancel")}
        variant="danger"
        loading={isShuttingDown}
      />

      <ConfirmModal
        isOpen={showRestartModal}
        onClose={() => setShowRestartModal(false)}
        onConfirm={handleRestart}
        title={t("restart")}
        message={t("restartConfirm")}
        confirmText={t("restart")}
        cancelText={tc("cancel")}
        variant="warning"
        loading={isRestarting}
      />

      {isDisconnected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="text-center p-8">
            <div className="flex items-center justify-center size-16 rounded-full bg-red-500/20 text-red-500 mx-auto mb-4">
              <span className="material-symbols-outlined text-[32px]">power_off</span>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Server Disconnected</h2>
            <p className="text-text-muted mb-6">
              The proxy server has been stopped or is restarting.
            </p>
            <Button variant="secondary" onClick={() => globalThis.location.reload()}>
              Reload Page
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

Sidebar.propTypes = {
  onClose: PropTypes.func,
  collapsed: PropTypes.bool,
  onToggleCollapse: PropTypes.func,
};
