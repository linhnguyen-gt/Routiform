import { useCallback } from "react";
import type { ProviderDetailActionProps } from "../types/actions";

export function useProviderDetailTestActions({
  providerId,
  connections,
  fetchConnections,
  notify,
  t,
  setBatchTesting,
  setBatchTestResults,
  setTestingModelKey,
  setModelTestBannerError,
  setModelTestResults,
  batchTesting,
  modelTestInFlightRef,
  setTestingAllModels,
  testAllModelsInFlightRef,
}: Pick<
  ProviderDetailActionProps,
  "providerId" | "connections" | "fetchConnections" | "notify" | "t"
> & {
  setBatchTesting: (val: boolean) => void;
  setBatchTestResults: (val: Record<string, unknown>) => void;
  setTestingModelKey: (key: string | null) => void;
  setModelTestBannerError: (err: string) => void;
  setModelTestResults: (
    fn: (prev: Record<string, "ok" | "error">) => Record<string, "ok" | "error">
  ) => void;
  batchTesting: boolean;
  retestingId: string | null;
  modelTestInFlightRef: { current: boolean };
  setTestingAllModels: (val: boolean) => void;
  testAllModelsInFlightRef: { current: boolean };
}) {
  const handleTestModel = useCallback(
    async (fullModel: string): Promise<boolean> => {
      if (modelTestInFlightRef.current) return false;
      if (!connections.length) {
        notify.error(t("addConnectionToImport"));
        return false;
      }
      modelTestInFlightRef.current = true;
      setTestingModelKey(fullModel);
      setModelTestBannerError("");
      let success = false;
      try {
        const request = {
          url: "/api/models/test",
          body: JSON.stringify({ model: fullModel }),
          fromConnectionTest: false,
        };

        const res = await fetch(request.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: request.body,
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          valid?: boolean;
          status?: number | string;
          latencyMs?: number;
          error?: string;
        };
        const providerStatus =
          typeof data.status === "number"
            ? data.status
            : typeof data.status === "string" && /^\d+$/.test(data.status)
              ? Number.parseInt(data.status, 10)
              : null;
        const hasProviderErrorStatus = providerStatus !== null && providerStatus >= 400;
        const hasErrorText =
          typeof data.error === "string" &&
          data.error.trim().length > 0 &&
          /(?:^|\b)(?:\[\s*\d{3}\s*]|error\s*\[\s*\d{3}\s*]|payment required|paid model|add credits?|you\s+have\s+reached\s+(?:the\s+)?limit|quota exceeded|insufficient\s+(?:quota|credit|credits|balance)|unauthorized|forbidden|invalid api key)/i.test(
            data.error
          );
        const ok = request.fromConnectionTest
          ? Boolean(data.valid) && !hasProviderErrorStatus
          : Boolean(data.ok) && !hasProviderErrorStatus && !hasErrorText;
        success = ok;
        setModelTestResults((prev) => ({ ...prev, [fullModel]: ok ? "ok" : "error" }));
        if (ok) {
          setModelTestBannerError("");
          const ms = typeof data.latencyMs === "number" ? data.latencyMs : null;
          notify.success(ms != null ? t("modelTestOk", { ms }) : t("testSuccess"));
        } else {
          const err =
            typeof data.error === "string" && data.error.length > 0 ? data.error : t("testFailed");
          setModelTestBannerError(err);
          notify.error(err);
        }
      } catch {
        setModelTestResults((prev) => ({ ...prev, [fullModel]: "error" }));
        const netErr = t("errorTypeNetworkError");
        setModelTestBannerError(netErr);
        notify.error(netErr);
        success = false;
      } finally {
        modelTestInFlightRef.current = false;
        setTestingModelKey(null);
      }
      return success;
    },
    [
      connections,
      notify,
      t,
      modelTestInFlightRef,
      setTestingModelKey,
      setModelTestBannerError,
      setModelTestResults,
    ]
  );

  /**
   * Probe every listed model once, so the page can show which of them this account can
   * actually call. Sequential on purpose: each probe is a real upstream request against the
   * user's quota, and `handleTestModel` refuses to start while another is in flight — firing
   * them in parallel would silently drop all but the first.
   */
  const handleTestAllModels = useCallback(
    async (fullModels: string[]) => {
      // Re-entrancy is guarded by a ref, not the `testingAllModels` state: the state exists
      // to re-render the button, and reading it here would capture a stale value from the
      // render that created this callback. Same reason `handleTestModel` uses a ref.
      if (testAllModelsInFlightRef.current || connections.length === 0) return;
      const targets = [...new Set(fullModels.filter(Boolean))];
      if (targets.length === 0) return;

      testAllModelsInFlightRef.current = true;
      setTestingAllModels(true);
      setModelTestBannerError("");
      let passed = 0;
      let done = 0;
      try {
        for (const fullModel of targets) {
          if (await handleTestModel(fullModel)) passed++;
          done++;
        }
        // handleTestModel already toasts per model; this is the only summary the user sees,
        // and it must report what actually ran, not the size of the list.
        notify.info(t("modelAvailabilitySummary", { passed, total: done }));
      } finally {
        testAllModelsInFlightRef.current = false;
        setTestingAllModels(false);
      }
    },
    [
      connections.length,
      handleTestModel,
      notify,
      t,
      setModelTestBannerError,
      setTestingAllModels,
      testAllModelsInFlightRef,
    ]
  );

  const handleBatchTestAll = useCallback(async () => {
    if (batchTesting || connections.length === 0) return;
    setBatchTesting(true);
    setBatchTestResults(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);
    try {
      const res = await fetch("/api/providers/test-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "provider", providerId }),
        signal: controller.signal,
      });
      let data: {
        error?: string | { message?: string; error?: string };
        results?: unknown[];
        summary?: { passed: number; failed: number; total: number } | null;
      };
      try {
        data = await res.json();
      } catch {
        data = { error: t("providerTestFailed"), results: [], summary: null };
      }
      setBatchTestResults({
        ...data,
        error: data.error
          ? typeof data.error === "object"
            ? data.error.message || data.error.error || JSON.stringify(data.error)
            : String(data.error)
          : null,
      });
      if (data?.summary) {
        const { passed, failed, total } = data.summary;
        if (failed === 0) notify.success(t("allTestsPassed", { total }));
        else notify.warning(t("testSummary", { passed, failed, total }));
      }
      await fetchConnections();
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      const msg = isAbort ? t("providerTestTimeout") : t("providerTestFailed");
      setBatchTestResults({ error: msg, results: [], summary: null });
      notify.error(msg);
    } finally {
      clearTimeout(timeoutId);
      setBatchTesting(false);
    }
  }, [
    batchTesting,
    connections.length,
    providerId,
    fetchConnections,
    notify,
    t,
    setBatchTesting,
    setBatchTestResults,
  ]);

  return { handleTestModel, handleBatchTestAll, handleTestAllModels };
}
