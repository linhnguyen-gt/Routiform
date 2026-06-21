"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  const [logLines, setLogLines] = useState<string[]>([]);
  const logBoxRef = useRef<HTMLPreElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const phase = mapPhase(status, loading);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(
      () => {
        void fetchStatus();
      },
      phase === "running" ? 10000 : 2000
    );
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, fetchStatus]);

  useEffect(() => {
    if (phase !== "starting") {
      setLogLines([]);
      return;
    }
    let cancelled = false;
    const fetchLog = async () => {
      try {
        const res = await fetch("/api/open-webui/logs", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { lines: string[] };
        if (!cancelled) setLogLines(data.lines);
      } catch {
        // best-effort log tail — ignore transient failures
      }
    };
    void fetchLog();
    const interval = setInterval(fetchLog, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [phase]);

  useEffect(() => {
    if (logBoxRef.current) {
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }
  }, [logLines]);

  const reloadIframe = () => {
    const el = iframeRef.current;
    if (el && status?.url) el.src = status.url;
  };

  const isRunning = phase === "running" && status?.url;

  return (
    <div className="fixed inset-0 z-50 flex h-screen w-full flex-col overflow-hidden bg-bg">
      {/* Thin top bar: back-to-dashboard + chat status + actions */}
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border/60 bg-surface px-3 text-sm">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-text-muted transition-colors hover:bg-black/5 hover:text-text-main dark:hover:bg-white/5"
          title="Back to dashboard"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          <span className="hidden sm:inline">Dashboard</span>
        </Link>
        <span className="text-text-main">{t("title")}</span>
        <span className="ml-auto flex items-center gap-2">
          {isRunning && (
            <>
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                {t("running")}
              </span>
              <button
                type="button"
                onClick={reloadIframe}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-text-muted transition-colors hover:bg-black/5 hover:text-text-main dark:hover:bg-white/5"
                title={t("reloadIframe")}
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
                <span className="hidden sm:inline">{t("reloadIframe")}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  status?.url && window.open(status.url, "_blank", "noopener,noreferrer")
                }
                className="flex items-center gap-1 rounded-md px-2 py-1 text-text-muted transition-colors hover:bg-black/5 hover:text-text-main dark:hover:bg-white/5"
                title={t("openChatNewTab")}
              >
                <span className="material-symbols-outlined text-[16px]">open_in_new</span>
              </button>
              <button
                type="button"
                onClick={stopOpenWebui}
                disabled={actionLoading}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-text-muted transition-colors hover:bg-black/5 hover:text-text-main dark:hover:bg-white/5"
                title={t("stop")}
              >
                <span className="material-symbols-outlined text-[16px]">power_settings_new</span>
              </button>
            </>
          )}
        </span>
      </header>

      {/* Body: iframe when running, otherwise the launcher card */}
      {isRunning ? (
        <iframe
          ref={iframeRef}
          src={status.url}
          title={t("title")}
          className="h-full w-full flex-1 border-0 bg-surface"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-10">
          <div className="mx-auto max-w-2xl space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-text-main">{t("title")}</h1>
              <p className="mt-1 text-sm text-text-muted">{t("subtitle")}</p>
            </div>

            <div className="space-y-4 rounded-xl border border-border/60 bg-surface p-5">
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
                  <button
                    type="button"
                    onClick={() => fetchStatus()}
                    disabled={actionLoading}
                    className="rounded-lg bg-bg-secondary px-3 py-1.5 text-sm font-medium text-text-main transition-colors hover:bg-bg-tertiary disabled:opacity-50"
                  >
                    {t("retry")}
                  </button>
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
                    <button
                      type="button"
                      onClick={() =>
                        status?.url && window.open(status.url, "_blank", "noopener,noreferrer")
                      }
                      disabled={!status?.reachable}
                      className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
                    >
                      {t("openChatNewTab")}
                    </button>
                    <button
                      type="button"
                      onClick={() => fetchStatus()}
                      disabled={actionLoading}
                      className="rounded-lg bg-bg-secondary px-3 py-1.5 text-sm font-medium text-text-main transition-colors hover:bg-bg-tertiary disabled:opacity-50"
                    >
                      {t("retry")}
                    </button>
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
                  {logLines.length > 0 && (
                    <pre
                      ref={logBoxRef}
                      className="max-h-48 overflow-y-auto rounded-lg bg-black/5 p-3 text-xs leading-relaxed text-text-muted dark:bg-white/5"
                    >
                      {logLines.join("\n")}
                    </pre>
                  )}
                  <button
                    type="button"
                    onClick={stopOpenWebui}
                    disabled={actionLoading}
                    className="rounded-lg bg-bg-secondary px-3 py-1.5 text-sm font-medium text-text-main transition-colors hover:bg-bg-tertiary disabled:opacity-50"
                  >
                    {t("stop")}
                  </button>
                </div>
              )}

              {phase === "stopped" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-text-muted">
                    <span className="material-symbols-outlined text-[20px]">stop_circle</span>
                    <span className="text-sm font-medium">{t("stopped")}</span>
                  </div>
                  <button
                    type="button"
                    onClick={startOpenWebui}
                    disabled={actionLoading}
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
                  >
                    {t("start")}
                  </button>
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
                    <button
                      type="button"
                      onClick={startOpenWebui}
                      disabled={actionLoading}
                      className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
                    >
                      {t("retry")}
                    </button>
                    <button
                      type="button"
                      onClick={() => fetchStatus()}
                      disabled={actionLoading}
                      className="rounded-lg bg-bg-secondary px-3 py-1.5 text-sm font-medium text-text-main transition-colors hover:bg-bg-tertiary disabled:opacity-50"
                    >
                      {t("checkStatus")}
                    </button>
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
