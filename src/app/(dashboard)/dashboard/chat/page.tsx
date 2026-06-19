"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card } from "@/shared/components";
import { useTranslations } from "next-intl";

type Phase = "loading" | "not_available" | "starting" | "running" | "error" | "stopped" | "docker";

type StatusResponse = {
  phase: string;
  runtime: string;
  dockerMode: boolean;
  url: string | null;
  reachable: boolean;
  pid: number | null;
  lastError: string | null;
  logPath: string;
};

function mapPhase(status: StatusResponse | null, loading: boolean): Phase {
  if (loading && !status) return "loading";
  if (!status) return "loading";
  if (status.dockerMode && !status.reachable) return "docker";
  if (status.phase === "not_available") return "not_available";
  if (status.phase === "running") return "running";
  if (status.phase === "starting") return "starting";
  if (status.phase === "error") return "error";
  return "stopped";
}

export default function ChatLauncherPage() {
  const t = useTranslations("chatLauncher");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoOpenedRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/open-webui/status", { cache: "no-store" });
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return null;
      }
      const data = (await res.json()) as StatusResponse;
      setStatus(data);
      setError(null);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load status");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const startOpenWebui = useCallback(async () => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/open-webui/start", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `HTTP ${res.status}`);
      }
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
    } finally {
      setActionLoading(false);
    }
  }, [fetchStatus]);

  const stopOpenWebui = useCallback(async () => {
    setActionLoading(true);
    try {
      await fetch("/api/open-webui/stop", { method: "POST" });
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop");
    } finally {
      setActionLoading(false);
    }
  }, [fetchStatus]);

  useEffect(() => {
    void fetchStatus().then((initial) => {
      if (
        initial &&
        !initial.dockerMode &&
        initial.phase !== "running" &&
        initial.phase !== "starting" &&
        initial.phase !== "not_available"
      ) {
        void startOpenWebui();
      }
    });
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchStatus, startOpenWebui]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (phase === "running") {
      pollRef.current = setInterval(() => {
        void fetchStatus();
      }, 10000);
    } else {
      pollRef.current = setInterval(() => {
        void fetchStatus();
      }, 2000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, fetchStatus]);

  const phase = mapPhase(status, loading);

  useEffect(() => {
    if (phase === "running" && status?.url && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      window.open(status.url, "_blank", "noopener,noreferrer");
    }
    if (phase !== "running") {
      autoOpenedRef.current = false;
    }
  }, [phase, status?.url]);

  const openChat = () => {
    if (status?.url) window.open(status.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-main">{t("title")}</h1>
        <p className="mt-1 text-sm text-text-muted">{t("subtitle")}</p>
      </div>

      <Card className="space-y-4 p-5">
        {phase === "loading" && (
          <div className="flex items-center gap-3 text-sm text-text-muted">
            <span className="material-symbols-outlined animate-spin text-[20px]">
              progress_activity
            </span>
            {t("loading")}
          </div>
        )}

        {phase === "not_available" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-amber-600">
              <span className="material-symbols-outlined text-[20px]">warning</span>
              <span className="text-sm font-medium">{t("notAvailable")}</span>
            </div>
            <div className="rounded-xl border border-border/60 bg-surface/40 p-4 text-sm">
              <p className="font-medium">{t("installUv")}</p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-black/5 p-2 text-xs dark:bg-white/5">
                {t("installHintUv")}
              </pre>
            </div>
            <div className="rounded-xl border border-border/60 bg-surface/40 p-4 text-sm">
              <p className="font-medium">{t("installPip")}</p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-black/5 p-2 text-xs dark:bg-white/5">
                {t("installHintPip")}
              </pre>
            </div>
            <Button variant="secondary" onClick={() => fetchStatus()} disabled={actionLoading}>
              {t("retry")}
            </Button>
          </div>
        )}

        {phase === "docker" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-blue-600">
              <span className="material-symbols-outlined text-[20px]">dns</span>
              <span className="text-sm font-medium">{t("dockerMode")}</span>
            </div>
            <pre className="overflow-x-auto rounded-lg bg-black/5 p-3 text-xs dark:bg-white/5">
              {t("dockerHint")}
            </pre>
            <div className="flex gap-2">
              <Button variant="primary" onClick={openChat} disabled={!status?.reachable}>
                {t("openChatNewTab")}
              </Button>
              <Button variant="secondary" onClick={() => fetchStatus()} disabled={actionLoading}>
                {t("retry")}
              </Button>
            </div>
          </div>
        )}

        {phase === "starting" && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm text-text-main">
              <span className="material-symbols-outlined animate-spin text-[20px]">
                progress_activity
              </span>
              <span>{t("starting")}</span>
            </div>
            <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
              {t("firstRunNotice")}
            </p>
            <Button variant="secondary" onClick={stopOpenWebui} disabled={actionLoading}>
              {t("stop")}
            </Button>
          </div>
        )}

        {phase === "running" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-600">
              <span className="material-symbols-outlined text-[20px]">check_circle</span>
              <span className="text-sm font-medium">{t("running")}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={openChat}>
                {t("openChatNewTab")}
              </Button>
              <Button variant="secondary" onClick={stopOpenWebui} disabled={actionLoading}>
                {t("stop")}
              </Button>
            </div>
          </div>
        )}

        {phase === "stopped" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-text-muted">
              <span className="material-symbols-outlined text-[20px]">stop_circle</span>
              <span className="text-sm font-medium">{t("stopped")}</span>
            </div>
            <Button variant="primary" onClick={startOpenWebui} disabled={actionLoading}>
              {t("start")}
            </Button>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-red-600">
              <span className="material-symbols-outlined text-[20px]">error</span>
              <span className="text-sm font-medium">{t("error")}</span>
            </div>
            {status?.lastError && (
              <pre className="overflow-x-auto rounded-lg bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-300">
                {status.lastError}
              </pre>
            )}
            <div className="flex gap-2">
              <Button variant="primary" onClick={startOpenWebui} disabled={actionLoading}>
                {t("retry")}
              </Button>
              <Button variant="secondary" onClick={() => fetchStatus()} disabled={actionLoading}>
                {t("loading")}
              </Button>
            </div>
          </div>
        )}

        {error && (
          <pre className="overflow-x-auto rounded-lg bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-300">
            {error}
          </pre>
        )}

        {status && phase !== "loading" && (
          <div className="border-t border-border/40 pt-3 text-xs text-text-muted">
            <span className="font-mono">
              {t("portLabel")} · runtime: {status.runtime}
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}
