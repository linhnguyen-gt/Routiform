import { useState } from "react";

export interface UseProviderDetailModalsReturn {
  showOAuthModal: boolean;
  setShowOAuthModal: (show: boolean) => void;
  showAddApiKeyModal: boolean;
  setShowAddApiKeyModal: (show: boolean) => void;
  showBulkImportModal: boolean;
  setShowBulkImportModal: (show: boolean) => void;
  showEditModal: boolean;
  setShowEditModal: (show: boolean) => void;
  showEditNodeModal: boolean;
  setShowEditNodeModal: (show: boolean) => void;
  selectedConnection: (Record<string, unknown> & { id: string }) | null;
  setSelectedConnection: (conn: (Record<string, unknown> & { id: string }) | null) => void;
  batchTestResults: unknown;
  setBatchTestResults: (results: unknown) => void;
}

export function useProviderDetailModals(): UseProviderDetailModalsReturn {
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [showAddApiKeyModal, setShowAddApiKeyModal] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEditNodeModal, setShowEditNodeModal] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<
    (Record<string, unknown> & { id: string }) | null
  >(null);
  const [batchTestResults, setBatchTestResults] = useState<unknown>(null);

  return {
    showOAuthModal,
    setShowOAuthModal,
    showAddApiKeyModal,
    setShowAddApiKeyModal,
    showBulkImportModal,
    setShowBulkImportModal,
    showEditModal,
    setShowEditModal,
    showEditNodeModal,
    setShowEditNodeModal,
    selectedConnection,
    setSelectedConnection,
    batchTestResults,
    setBatchTestResults,
  };
}
