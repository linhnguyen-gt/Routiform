"use client";

import {
  CursorAuthModal,
  DevinAuthModal,
  KiroOAuthWrapper,
  OAuthModal,
  ProxyConfigModal,
} from "@/shared/components";
import { ProviderDetailAddApiKeyModal } from "../../components/ProviderDetailAddApiKeyModal";
import { ProviderDetailBulkImportKeysModal } from "../../components/ProviderDetailBulkImportKeysModal";
import { ProviderDetailEditConnectionModal } from "../../components/ProviderDetailEditConnectionModal";
import { ProviderDetailEditCompatibleNodeModal } from "../../components/ProviderDetailEditCompatibleNodeModal";
import { ProviderDetailBatchTestResultsModal } from "../../components/ProviderDetailBatchTestResultsModal";

interface ProviderDetailModalsSectionProps {
  providerId: string;
  providerInfo: { name?: string } | null | undefined;
  showOAuthModal: boolean;
  setShowOAuthModal: (val: boolean) => void;
  handleOAuthSuccess: () => void;
  showAddApiKeyModal: boolean;
  setShowAddApiKeyModal: (val: boolean) => void;
  showBulkImportModal: boolean;
  setShowBulkImportModal: (val: boolean) => void;
  fetchConnections: () => void | Promise<void>;
  isCompatible: boolean;
  isAnthropicProtocolCompatible: boolean;
  isCcCompatible: boolean;
  handleSaveApiKey: (data: Record<string, unknown>) => Promise<string | null>;
  showEditModal: boolean;
  setShowEditModal: (val: boolean) => void;
  selectedConnection: Record<string, unknown> | null;
  handleUpdateConnection: (data: Record<string, unknown>) => Promise<string | null>;
  showEditNodeModal: boolean;
  setShowEditNodeModal: (val: boolean) => void;
  providerNode: Record<string, unknown> | null;
  handleUpdateNode: (data: Record<string, unknown>) => Promise<void>;
  batchTestResults: Record<string, unknown> | null;
  setBatchTestResults: (val: Record<string, unknown> | null) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
  proxyTarget: { level: string; id: string; label: string } | null;
  setProxyTarget: (val: { level: string; id: string; label: string } | null) => void;
  loadConnProxies: (conns: unknown[]) => Promise<void>;
  connections: unknown[];
}

export function ProviderDetailModalsSection({
  providerId,
  providerInfo,
  showOAuthModal,
  setShowOAuthModal,
  handleOAuthSuccess,
  showAddApiKeyModal,
  setShowAddApiKeyModal,
  showBulkImportModal,
  setShowBulkImportModal,
  fetchConnections,
  isCompatible,
  isAnthropicProtocolCompatible,
  isCcCompatible,
  handleSaveApiKey,
  showEditModal,
  setShowEditModal,
  selectedConnection,
  handleUpdateConnection,
  showEditNodeModal,
  setShowEditNodeModal,
  providerNode,
  handleUpdateNode,
  batchTestResults,
  setBatchTestResults,
  t,
  proxyTarget,
  setProxyTarget,
  loadConnProxies,
  connections,
}: ProviderDetailModalsSectionProps) {
  return (
    <>
      {providerId === "kiro" ? (
        <KiroOAuthWrapper
          isOpen={showOAuthModal}
          providerInfo={providerInfo}
          onSuccess={handleOAuthSuccess}
          onClose={() => setShowOAuthModal(false)}
        />
      ) : providerId === "cursor" ? (
        <CursorAuthModal
          isOpen={showOAuthModal}
          onSuccess={handleOAuthSuccess}
          onClose={() => setShowOAuthModal(false)}
        />
      ) : providerId === "devin" ? (
        <DevinAuthModal
          isOpen={showOAuthModal}
          onSuccess={handleOAuthSuccess}
          onClose={() => setShowOAuthModal(false)}
        />
      ) : (
        <OAuthModal
          isOpen={showOAuthModal}
          provider={providerId}
          providerInfo={providerInfo?.name ? { name: providerInfo.name } : null}
          onSuccess={handleOAuthSuccess}
          onClose={() => setShowOAuthModal(false)}
        />
      )}
      <ProviderDetailAddApiKeyModal
        isOpen={showAddApiKeyModal}
        provider={providerId}
        providerName={providerInfo?.name}
        isCompatible={isCompatible}
        isAnthropic={isAnthropicProtocolCompatible}
        isCcCompatible={isCcCompatible}
        onSave={handleSaveApiKey}
        onClose={() => setShowAddApiKeyModal(false)}
      />
      <ProviderDetailBulkImportKeysModal
        isOpen={showBulkImportModal}
        provider={providerId}
        providerName={providerInfo?.name}
        existingNames={connections
          .map((c) => (c as { name?: unknown }).name)
          .filter((n): n is string => typeof n === "string")}
        onImported={fetchConnections}
        onClose={() => setShowBulkImportModal(false)}
      />
      <ProviderDetailEditConnectionModal
        isOpen={showEditModal}
        connection={selectedConnection}
        onSave={handleUpdateConnection}
        onClose={() => setShowEditModal(false)}
      />
      {isCompatible && (
        <ProviderDetailEditCompatibleNodeModal
          isOpen={showEditNodeModal}
          node={providerNode}
          onSave={handleUpdateNode}
          onClose={() => setShowEditNodeModal(false)}
          isAnthropic={isAnthropicProtocolCompatible}
          isCcCompatible={isCcCompatible}
        />
      )}
      <ProviderDetailBatchTestResultsModal
        batchTestResults={batchTestResults}
        providerName={providerInfo?.name || providerId}
        t={t}
        onClose={() => setBatchTestResults(null)}
      />
      {proxyTarget && (
        <ProxyConfigModal
          isOpen={!!proxyTarget}
          onClose={() => setProxyTarget(null)}
          level={proxyTarget.level}
          levelId={proxyTarget.id}
          levelLabel={proxyTarget.label}
          onSaved={() => void loadConnProxies(connections)}
        />
      )}
    </>
  );
}
