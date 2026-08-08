import { useCallback } from "react";
import type { ProviderDetailActionProps } from "../types/actions";

export function useProviderDetailConnectionActions({
  connections,
  sortedConnectionIds,
  setConnections,
  setSelectedConnectionIds,
  fetchConnections,
  notify,
  t,
  setBulkDeletingConnections,
  setBulkUpdatingStatus,
  setRetestingId,
  retestingId,
}: Pick<
  ProviderDetailActionProps,
  | "connections"
  | "sortedConnectionIds"
  | "setConnections"
  | "setSelectedConnectionIds"
  | "fetchConnections"
  | "notify"
  | "t"
> & {
  setBulkDeletingConnections: (val: boolean) => void;
  setBulkUpdatingStatus: (val: boolean) => void;
  setRetestingId: (id: string | null) => void;
  retestingId: string | null;
}) {
  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm(t("deleteConnectionConfirm"))) return;
      try {
        const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
        if (res.ok) {
          setConnections(connections.filter((c) => c.id !== id));
          setSelectedConnectionIds((prev) => prev.filter((x) => x !== id));
        }
      } catch (error) {
        console.log("Error deleting connection:", error);
      }
    },
    [connections, setConnections, setSelectedConnectionIds, t]
  );

  const handleBulkDeleteConnections = useCallback(
    async (selectedConnectionIds: string[]) => {
      const ids = selectedConnectionIds.filter((id) => sortedConnectionIds.includes(id));
      if (!ids.length) return;
      if (!confirm(t("bulkDeleteConnectionsConfirm", { count: ids.length }))) return;
      setBulkDeletingConnections(true);
      const deleted: string[] = [];
      try {
        for (const id of ids) {
          try {
            const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
            if (res.ok) deleted.push(id);
          } catch {
            // continue
          }
        }
        setConnections((prev) => prev.filter((c: { id?: string }) => !deleted.includes(c.id!)));
        setSelectedConnectionIds((prev) => prev.filter((id) => !deleted.includes(id)));
        if (deleted.length === ids.length) {
          notify.success(t("bulkDeleteConnectionsSuccess", { count: deleted.length }));
        } else if (deleted.length > 0) {
          notify.error(
            t("bulkDeleteConnectionsPartial", { removed: deleted.length, total: ids.length })
          );
        } else {
          notify.error(t("bulkDeleteConnectionsNone"));
        }
      } finally {
        setBulkDeletingConnections(false);
      }
    },
    [
      sortedConnectionIds,
      setConnections,
      setSelectedConnectionIds,
      setBulkDeletingConnections,
      notify,
      t,
    ]
  );

  const handleBulkUpdateConnectionStatus = useCallback(
    async (selectedConnectionIds: string[], isActive: boolean) => {
      const ids = selectedConnectionIds.filter((id) => sortedConnectionIds.includes(id));
      if (!ids.length) return;
      setBulkUpdatingStatus(true);
      try {
        await Promise.allSettled(
          ids.map((id) =>
            fetch(`/api/providers/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isActive }),
            })
          )
        );
        setConnections((prev) =>
          prev.map((c) => (c.id && ids.includes(String(c.id)) ? { ...c, isActive } : c))
        );
        notify.success(
          isActive ? `Switched on selected connection(s)` : `Switched off selected connection(s)`
        );
      } catch (error) {
        console.error("Bulk status update failed", error);
        notify.error("Bulk status update failed");
      } finally {
        setBulkUpdatingStatus(false);
      }
    },
    [sortedConnectionIds, setConnections, setBulkUpdatingStatus, notify]
  );

  const handleUpdateConnectionStatus = useCallback(
    async (id: string, isActive: boolean) => {
      try {
        const res = await fetch(`/api/providers/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive }),
        });
        if (res.ok) {
          setConnections((prev) => prev.map((c) => (c.id === id ? { ...c, isActive } : c)));
        }
      } catch (error) {
        console.log("Error updating connection status:", error);
      }
    },
    [setConnections]
  );

  const handleRetestConnection = useCallback(
    async (connectionId: string) => {
      if (!connectionId || retestingId) return;
      setRetestingId(connectionId);
      try {
        const res = await fetch(`/api/providers/${connectionId}/test`, { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.error || t("failedRetestConnection"));
          return;
        }
        await fetchConnections();
      } catch (error) {
        console.error("Error retesting connection:", error);
      } finally {
        setRetestingId(null);
      }
    },
    [retestingId, fetchConnections, setRetestingId, t]
  );

  return {
    handleDelete,
    handleBulkDeleteConnections,
    handleBulkUpdateConnectionStatus,
    handleUpdateConnectionStatus,
    handleRetestConnection,
  };
}
