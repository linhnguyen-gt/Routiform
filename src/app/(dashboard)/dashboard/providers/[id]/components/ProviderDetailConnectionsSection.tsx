"use client";

import { Button, Card, Toggle } from "@/shared/components";
import { ProviderDetailConnectionRow } from "../../components/ProviderDetailConnectionRow";
import type { ConnectionRowConnection } from "../types/connections";

interface ProviderDetailConnectionsSectionProps {
  t: (key: string, params?: Record<string, unknown>) => string;
  connections: ConnectionRowConnection[];
  providerId: string;
  providerInfo: { name?: string } | null | undefined;
  isOAuth: boolean;
  isCompatible: boolean;
  providerSupportsPat: boolean;
  openPrimaryAddFlow: () => void;
  setShowAddApiKeyModal: (val: boolean) => void;
  handleBatchTestAll: () => void;
  batchTesting: boolean;
  retestingId: string | null;
  proxyConfig: { providers?: Record<string, { host?: string }> } | null | undefined;
  setProxyTarget: (
    target: { level: string; id: string | undefined; label: string | undefined } | null
  ) => void;
  sortedConnectionIds: string[];
  selectedConnectionIds: string[];
  toggleSelectAllConnections: () => void;
  toggleConnectionBulkSelect: (id: string) => void;
  selectAllConnectionsRef: React.RefObject<HTMLInputElement | null>;
  handleBulkDeleteConnections: (ids: string[]) => void;
  bulkDeletingConnections: boolean;
  allSelectedActive: boolean;
  bulkUpdatingStatus: boolean;
  handleBulkUpdateConnectionStatus: (ids: string[], active: boolean) => void;
  handleSwapPriority: (c1: ConnectionRowConnection, c2: ConnectionRowConnection) => void;
  handleUpdateConnectionStatus: (id: string, active: boolean) => void;
  handleToggleRateLimit: (id: string, enabled: boolean) => void;
  handleToggleCodexLimit: (id: string, field: string, enabled: boolean) => void;
  isCcCompatible?: boolean;
  cpaProviderEnabled?: boolean;
  onToggleCliproxyapiMode?: (enabled: boolean) => void;
  handleRetestConnection: (id: string) => void;
  setSelectedConnection: (conn: ConnectionRowConnection) => void;
  setShowEditModal: (val: boolean) => void;
  handleDelete: (id: string) => void;
  allowQoderOAuthUi: boolean;
  setShowOAuthModal: (val: boolean) => void;
  handleRefreshToken: (id: string) => void;
  refreshingId: string | null;
  handleApplyCodexAuthLocal: (id: string) => void;
  applyingCodexAuthId: string | null;
  handleExportCodexAuthFile: (id: string) => void;
  exportingCodexAuthId: string | null;
  connProxyMap: Record<string, { proxy?: { host?: string } | null; level?: string }>;
}

export function ProviderDetailConnectionsSection({
  t,
  connections,
  providerId,
  providerInfo,
  isOAuth,
  isCompatible,
  providerSupportsPat,
  openPrimaryAddFlow,
  setShowAddApiKeyModal,
  handleBatchTestAll,
  batchTesting,
  retestingId,
  proxyConfig,
  setProxyTarget,
  sortedConnectionIds,
  selectedConnectionIds,
  toggleSelectAllConnections,
  toggleConnectionBulkSelect,
  selectAllConnectionsRef,
  handleBulkDeleteConnections,
  bulkDeletingConnections,
  allSelectedActive,
  bulkUpdatingStatus,
  handleBulkUpdateConnectionStatus,
  handleSwapPriority,
  handleUpdateConnectionStatus,
  handleToggleRateLimit,
  handleToggleCodexLimit,
  isCcCompatible,
  cpaProviderEnabled,
  onToggleCliproxyapiMode,
  handleRetestConnection,
  setSelectedConnection,
  setShowEditModal,
  handleDelete,
  allowQoderOAuthUi,
  setShowOAuthModal,
  handleRefreshToken,
  refreshingId,
  handleApplyCodexAuthLocal,
  applyingCodexAuthId,
  handleExportCodexAuthFile,
  exportingCodexAuthId,
  connProxyMap,
}: ProviderDetailConnectionsSectionProps) {
  const sorted = [...connections].sort((a, b) => (a.priority || 0) - (b.priority || 0));
  const hasAnyTag = sorted.some((c) => c.providerSpecificData?.tag as string | undefined);

  const renderConnectionRow = (
    conn: ConnectionRowConnection,
    index: number,
    groupConns: ConnectionRowConnection[],
    gi: number,
    groupKeys: string[]
  ) => (
    <ProviderDetailConnectionRow
      key={conn.id}
      connection={conn as ConnectionRowConnection}
      isOAuth={conn.authType === "oauth"}
      isFirst={gi === 0 && index === 0}
      isLast={gi === groupKeys.length - 1 && index === groupConns.length - 1}
      onMoveUp={() => handleSwapPriority(conn, sorted[sorted.indexOf(conn) - 1])}
      onMoveDown={() => handleSwapPriority(conn, sorted[sorted.indexOf(conn) + 1])}
      onToggleActive={(isActive) => handleUpdateConnectionStatus(conn.id, !!isActive)}
      onToggleRateLimit={(enabled) => handleToggleRateLimit(conn.id, !!enabled)}
      isCodex={providerId === "codex"}
      isCcCompatible={isCcCompatible}
      cliproxyapiEnabled={cpaProviderEnabled}
      onToggleCliproxyapiMode={onToggleCliproxyapiMode}
      onToggleCodex5h={(enabled) => handleToggleCodexLimit(conn.id, "use5h", !!enabled)}
      onToggleCodexWeekly={(enabled) => handleToggleCodexLimit(conn.id, "useWeekly", !!enabled)}
      onRetest={() => handleRetestConnection(conn.id)}
      isRetesting={retestingId === conn.id}
      onEdit={() => {
        setSelectedConnection(conn);
        setShowEditModal(true);
      }}
      onDelete={() => handleDelete(conn.id)}
      showBulkSelect
      bulkSelected={typeof conn.id === "string" && selectedConnectionIds.includes(conn.id)}
      onToggleBulkSelect={
        typeof conn.id === "string" ? () => toggleConnectionBulkSelect(conn.id) : undefined
      }
      onReauth={
        (conn.authType === "oauth" && allowQoderOAuthUi) ||
        (providerId === "xai" && conn.authType === "oauth")
          ? () => setShowOAuthModal(true)
          : undefined
      }
      onRefreshToken={conn.authType === "oauth" ? () => handleRefreshToken(conn.id) : undefined}
      isRefreshing={refreshingId === conn.id}
      onApplyCodexAuthLocal={
        providerId === "codex" ? () => handleApplyCodexAuthLocal(conn.id) : undefined
      }
      isApplyingCodexAuthLocal={applyingCodexAuthId === conn.id}
      onExportCodexAuthFile={
        providerId === "codex" ? () => handleExportCodexAuthFile(conn.id) : undefined
      }
      isExportingCodexAuthFile={exportingCodexAuthId === conn.id}
      onProxy={() =>
        setProxyTarget({
          level: "key",
          id: conn.id,
          label: conn.name || conn.email || conn.id,
        })
      }
      hasProxy={!!connProxyMap[conn.id]?.proxy}
      proxySource={connProxyMap[conn.id]?.level || null}
      proxyHost={connProxyMap[conn.id]?.proxy?.host || null}
    />
  );

  return (
    <Card className="rounded-xl border-border/50 shadow-sm">
      <div className="mb-6 flex flex-col gap-4 border-b border-border/40 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span
            className="material-symbols-outlined hidden text-text-muted/70 sm:inline"
            aria-hidden
          >
            hub
          </span>
          <h2 className="text-lg font-semibold tracking-tight">{t("connections")}</h2>
          <button
            onClick={() =>
              setProxyTarget({
                level: "provider",
                id: providerId,
                label: providerInfo?.name || providerId,
              })
            }
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all ${proxyConfig?.providers?.[providerId] ? "bg-amber-500/15 text-amber-500" : "bg-black/[0.03] text-text-muted/50 dark:bg-white/[0.03]"}`}
          >
            <span className="material-symbols-outlined text-[14px]">vpn_lock</span>
            {proxyConfig?.providers?.[providerId]
              ? proxyConfig.providers[providerId].host || t("providerProxy")
              : t("providerProxy")}
          </button>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
          {connections.length > 1 && (
            <button
              onClick={handleBatchTestAll}
              disabled={batchTesting || !!retestingId}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium border-border bg-bg-subtle text-text-muted"
            >
              <span className="material-symbols-outlined text-[14px]">
                {batchTesting ? "sync" : "play_arrow"}
              </span>
              {batchTesting ? t("testing") : t("testAll")}
            </button>
          )}
          {!isCompatible ? (
            providerId === "xai" ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  icon="lock"
                  onClick={() => setShowOAuthModal(true)}
                  className="h-8 rounded-lg px-3 text-xs"
                >
                  SuperGrok OAuth
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon="key"
                  onClick={() => setShowAddApiKeyModal(true)}
                  className="h-8 rounded-lg px-3 text-xs"
                >
                  {t("add")}
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                icon="add"
                onClick={openPrimaryAddFlow}
                className="h-8 rounded-lg px-3 text-xs"
              >
                {providerSupportsPat ? "Add PAT" : t("add")}
              </Button>
            )
          ) : (
            connections.length === 0 && (
              <Button
                size="sm"
                icon="add"
                onClick={() => setShowAddApiKeyModal(true)}
                className="h-8 rounded-lg px-3 text-xs"
              >
                {t("add")}
              </Button>
            )
          )}
        </div>
      </div>

      {connections.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-gradient-to-r from-muted/40 to-transparent px-3 py-2.5 dark:from-zinc-900/40">
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-text-main">
            <input
              ref={selectAllConnectionsRef}
              type="checkbox"
              checked={
                sortedConnectionIds.length > 0 &&
                sortedConnectionIds.every((id) => selectedConnectionIds.includes(id))
              }
              onChange={toggleSelectAllConnections}
              className="rounded border-border"
            />
            <span>{t("selectAllConnections")}</span>
          </label>
          <span className="text-xs text-text-muted">
            {t("selectedConnectionsCount", { count: selectedConnectionIds.length })}
          </span>
          <Button
            size="sm"
            variant="danger"
            icon="delete"
            disabled={selectedConnectionIds.length === 0 || bulkDeletingConnections}
            loading={bulkDeletingConnections}
            onClick={() => handleBulkDeleteConnections(selectedConnectionIds)}
          >
            {t("deleteSelectedConnections")}
          </Button>
          {selectedConnectionIds.length > 0 && (
            <div className="flex items-center gap-2 border-l border-border/50 pl-3 ml-1">
              <Toggle
                size="sm"
                checked={allSelectedActive}
                disabled={bulkUpdatingStatus}
                onChange={(val) => handleBulkUpdateConnectionStatus(selectedConnectionIds, val)}
                label={t("active")}
              />
            </div>
          )}
        </div>
      )}

      {connections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-bg-subtle/30 py-14 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <span className="material-symbols-outlined text-[32px]">
              {isOAuth ? "lock" : "key"}
            </span>
          </div>
          <p className="mb-1 font-medium text-text-main">{t("noConnectionsYet")}</p>
          <p className="mb-4 text-sm text-text-muted">{t("addFirstConnectionHint")}</p>
          {!isCompatible &&
            (providerId === "xai" ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button icon="lock" onClick={() => setShowOAuthModal(true)}>
                  SuperGrok OAuth
                </Button>
                <Button variant="secondary" icon="key" onClick={() => setShowAddApiKeyModal(true)}>
                  {t("addConnection")}
                </Button>
              </div>
            ) : (
              <Button icon="add" onClick={openPrimaryAddFlow}>
                {providerSupportsPat ? "Add PAT" : t("addConnection")}
              </Button>
            ))}
        </div>
      ) : (
        (() => {
          if (!hasAnyTag) {
            return (
              <div className="overflow-hidden rounded-xl border border-border/50 bg-gradient-to-b from-bg-subtle/25 to-transparent dark:from-white/[0.02]">
                <div className="flex flex-col divide-y divide-border/50">
                  {sorted.map((conn, index) => renderConnectionRow(conn, index, sorted, 0, [""]))}
                </div>
              </div>
            );
          }

          const groupMap = new Map<string, ConnectionRowConnection[]>();
          for (const conn of sorted) {
            const tag = (conn.providerSpecificData?.tag as string | undefined)?.trim() || "";
            if (!groupMap.has(tag)) groupMap.set(tag, []);
            groupMap.get(tag)!.push(conn);
          }
          const groupKeys = Array.from(groupMap.keys()).sort((a, b) => {
            if (a === "") return -1;
            if (b === "") return 1;
            return a.localeCompare(b);
          });

          return (
            <div className="flex flex-col gap-3">
              {groupKeys.map((tag, gi) => {
                const groupConns = groupMap.get(tag)!;
                return (
                  <div
                    key={tag || "__untagged__"}
                    className={gi > 0 ? "mt-1 border-t border-border/50 pt-3" : ""}
                  >
                    {tag && (
                      <div className="flex items-center gap-2 px-1 pb-2 pt-1 sm:px-2">
                        <span className="material-symbols-outlined text-[13px] text-text-muted/50">
                          label
                        </span>
                        <span className="select-none text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted/70">
                          {tag}
                        </span>
                        <div className="h-px flex-1 bg-border/60" />
                        <span className="text-[10px] tabular-nums text-text-muted/50">
                          {groupConns.length}
                        </span>
                      </div>
                    )}
                    <div className="overflow-hidden rounded-xl border border-border/50 bg-gradient-to-b from-bg-subtle/25 to-transparent dark:from-white/[0.02]">
                      <div className="flex flex-col divide-y divide-border/50">
                        {groupConns.map((conn, index) =>
                          renderConnectionRow(conn, index, groupConns, gi, groupKeys)
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()
      )}
    </Card>
  );
}
