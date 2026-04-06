"use client";

import { useState, useEffect, useCallback } from "react";
import { SegmentedControl } from "@/shared/components";
import EndpointPageClient from "./EndpointPageClient";
import McpDashboardPage from "./components/MCPDashboard";
import A2ADashboardPage from "./components/A2ADashboard";
import ApiEndpointsTab from "./ApiEndpointsTab";
import { useTranslations } from "next-intl";
import { copyToClipboard } from "@/shared/utils/clipboard";
import { cn } from "@/shared/utils/cn";

type ServiceStatus = {
  online: boolean;
  loading: boolean;
};

type McpTransport = "stdio" | "sse" | "streamable-http";

/* ────── Toggle Switch ────── */
function ServiceToggle({
  label,
  status,
  enabled,
  onToggle,
  toggling,
}: {
  label: string;
  status: ServiceStatus;
  enabled: boolean;
  onToggle: () => void;
  toggling: boolean;
}) {
  return (
    <div className="flex items-center gap-3 ml-auto">
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
        style={{
          borderColor: status.loading
            ? "var(--color-border)"
            : status.online
              ? "rgba(34,197,94,0.3)"
              : "rgba(239,68,68,0.3)",
          background: status.loading
            ? "transparent"
            : status.online
              ? "rgba(34,197,94,0.1)"
              : "rgba(239,68,68,0.1)",
          color: status.loading
            ? "var(--color-text-muted)"
            : status.online
              ? "rgb(34,197,94)"
              : "rgb(239,68,68)",
        }}
      >
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{
            background: status.loading
              ? "var(--color-text-muted)"
              : status.online
                ? "rgb(34,197,94)"
                : "rgb(239,68,68)",
            animation: status.online ? "pulse 2s infinite" : "none",
          }}
        />
        {status.loading ? "..." : status.online ? "Online" : "Offline"}
      </div>

      <button
        onClick={onToggle}
        disabled={toggling}
        className="relative inline-flex items-center h-7 w-[52px] rounded-full transition-all duration-300 focus:outline-none border"
        style={{
          background: enabled ? "rgb(34,197,94)" : "var(--color-bg-tertiary)",
          borderColor: enabled ? "rgba(34,197,94,0.5)" : "var(--color-border)",
          opacity: toggling ? 0.6 : 1,
          cursor: toggling ? "wait" : "pointer",
        }}
        title={enabled ? `Disable ${label}` : `Enable ${label}`}
      >
        <span
          className="inline-block w-5 h-5 rounded-full shadow-md transition-all duration-300"
          style={{
            transform: enabled ? "translateX(26px)" : "translateX(3px)",
            background: enabled ? "#fff" : "var(--color-text-muted)",
          }}
        />
      </button>

      <span
        className="text-xs font-medium min-w-[24px]"
        style={{ color: enabled ? "rgb(34,197,94)" : "var(--color-text-muted)" }}
      >
        {toggling ? "..." : enabled ? "ON" : "OFF"}
      </span>
    </div>
  );
}

/* ────── Transport Selector ────── */
function TransportSelector({
  value,
  onChange,
  disabled,
  baseUrl,
}: {
  value: McpTransport;
  onChange: (t: McpTransport) => void;
  disabled: boolean;
  baseUrl: string;
}) {
  const options: { value: McpTransport; label: string; desc: string }[] = [
    { value: "stdio", label: "stdio", desc: "Local — IDE spawns process via routiform --mcp" },
    { value: "sse", label: "SSE", desc: "Remote — Server-Sent Events over HTTP" },
    {
      value: "streamable-http",
      label: "Streamable HTTP",
      desc: "Remote — Modern bidirectional HTTP",
    },
  ];

  const urlMap: Record<McpTransport, string> = {
    stdio: "routiform --mcp",
    sse: `${baseUrl}/api/mcp/sse`,
    "streamable-http": `${baseUrl}/api/mcp/stream`,
  };

  return (
    <div className="mt-4 rounded-xl border border-border/60 bg-bg-subtle/40 p-4 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.06]">
      <div className="mb-3 flex items-center gap-2">
        <span className="material-symbols-rounded text-base text-primary">swap_horiz</span>
        <span className="text-sm font-semibold text-text-main">Transport Mode</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            disabled={disabled}
            className={cn(
              "flex min-w-[140px] flex-col items-start rounded-lg border px-4 py-2.5 text-left transition-all duration-200",
              value === opt.value
                ? "border-primary/50 bg-primary/10 shadow-sm"
                : "border-border/60 bg-surface/50 hover:border-border",
              disabled ? "cursor-wait opacity-50" : "cursor-pointer"
            )}
          >
            <span
              className={cn(
                "text-sm font-semibold",
                value === opt.value ? "text-primary" : "text-text-main"
              )}
            >
              {opt.label}
            </span>
            <span className="mt-0.5 text-xs text-text-muted">{opt.desc}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/50 bg-bg-subtle/60 px-3 py-2">
        <span className="material-symbols-rounded text-sm text-text-muted">
          {value === "stdio" ? "terminal" : "link"}
        </span>
        <code className="min-w-0 flex-1 break-all text-xs text-text-muted">{urlMap[value]}</code>
        {value !== "stdio" && (
          <button
            type="button"
            className="ml-auto shrink-0 rounded-md border border-border/60 px-2 py-0.5 text-xs text-text-muted transition-colors hover:bg-sidebar hover:text-primary"
            onClick={() => void copyToClipboard(urlMap[value])}
            title="Copy URL"
          >
            Copy
          </button>
        )}
      </div>
    </div>
  );
}

/* ────── Main Page ────── */
export default function EndpointPage() {
  const [activeTab, setActiveTab] = useState("endpoint-proxy");
  const t = useTranslations("endpoints");
  const th = useTranslations("header");

  const [mcpStatus, setMcpStatus] = useState<ServiceStatus>({ online: false, loading: true });
  const [a2aStatus, setA2aStatus] = useState<ServiceStatus>({ online: false, loading: true });
  const [mcpEnabled, setMcpEnabled] = useState(false);
  const [a2aEnabled, setA2aEnabled] = useState(false);
  const [mcpToggling, setMcpToggling] = useState(false);
  const [a2aToggling, setA2aToggling] = useState(false);
  const [mcpTransport, setMcpTransport] = useState<McpTransport>("stdio");
  const [transportSaving, setTransportSaving] = useState(false);

  const [baseUrl, setBaseUrl] = useState("");

  // Detect base URL from browser
  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(`${window.location.protocol}//${window.location.host}`);
    }
  }, []);

  // Fetch initial settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          setMcpEnabled(!!data.mcpEnabled);
          setA2aEnabled(!!data.a2aEnabled);
          setMcpTransport((data.mcpTransport as McpTransport) || "stdio");
        }
      } catch {
        // defaults stay
      }
    };
    void fetchSettings();
  }, []);

  const patchSetting = useCallback(async (body: Record<string, unknown>) => {
    return fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }, []);

  const toggleService = useCallback(
    async (service: "mcp" | "a2a") => {
      const setToggling = service === "mcp" ? setMcpToggling : setA2aToggling;
      const setEnabled = service === "mcp" ? setMcpEnabled : setA2aEnabled;
      const currentlyEnabled = service === "mcp" ? mcpEnabled : a2aEnabled;
      const newValue = !currentlyEnabled;

      setToggling(true);
      try {
        const res = await patchSetting({
          [service === "mcp" ? "mcpEnabled" : "a2aEnabled"]: newValue,
        });
        if (res.ok) setEnabled(newValue);
      } catch {
        // keep current state
      } finally {
        setToggling(false);
      }
    },
    [mcpEnabled, a2aEnabled, patchSetting]
  );

  const changeTransport = useCallback(
    async (newTransport: McpTransport) => {
      setTransportSaving(true);
      try {
        const res = await patchSetting({ mcpTransport: newTransport });
        if (res.ok) setMcpTransport(newTransport);
      } catch {
        // keep current
      } finally {
        setTransportSaving(false);
      }
    },
    [patchSetting]
  );

  const refreshMcpStatus = useCallback(async () => {
    setMcpStatus((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch("/api/mcp/status");
      if (res.ok) {
        const data = await res.json();
        setMcpStatus({ online: !!data.online, loading: false });
      } else {
        setMcpStatus({ online: false, loading: false });
      }
    } catch {
      setMcpStatus({ online: false, loading: false });
    }
  }, []);

  const refreshA2aStatus = useCallback(async () => {
    setA2aStatus((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch("/api/a2a/status");
      if (res.ok) {
        const data = await res.json();
        setA2aStatus({ online: data.status === "ok", loading: false });
      } else {
        setA2aStatus({ online: false, loading: false });
      }
    } catch {
      setA2aStatus({ online: false, loading: false });
    }
  }, []);

  useEffect(() => {
    const load = () => {
      void refreshMcpStatus();
      void refreshA2aStatus();
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [refreshMcpStatus, refreshA2aStatus]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-8">
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-surface via-surface to-bg-subtle/40 p-6 shadow-sm ring-1 ring-black/[0.03] dark:to-white/[0.03] dark:ring-white/[0.06] sm:p-7">
        <div
          className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text-main">
              {th("endpoint")}
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-muted">
              {th("endpointDescription")}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/50 bg-surface/70 p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <SegmentedControl
              options={[
                { value: "endpoint-proxy", label: t("tabProxy"), icon: "api" },
                { value: "mcp", label: "MCP", icon: "hub" },
                { value: "a2a", label: "A2A", icon: "group_work" },
                { value: "api-endpoints", label: t("tabApiEndpoints"), icon: "code" },
              ]}
              value={activeTab}
              onChange={setActiveTab}
            />
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/40 pt-3 lg:border-t-0 lg:pt-0">
            {activeTab === "mcp" && (
              <ServiceToggle
                label="MCP"
                status={mcpStatus}
                enabled={mcpEnabled}
                onToggle={() => void toggleService("mcp")}
                toggling={mcpToggling}
              />
            )}
            {activeTab === "a2a" && (
              <ServiceToggle
                label="A2A"
                status={a2aStatus}
                enabled={a2aEnabled}
                onToggle={() => void toggleService("a2a")}
                toggling={a2aToggling}
              />
            )}
          </div>
        </div>
      </div>

      {activeTab === "mcp" && mcpEnabled && (
        <TransportSelector
          value={mcpTransport}
          onChange={(tr) => void changeTransport(tr)}
          disabled={transportSaving}
          baseUrl={baseUrl}
        />
      )}

      <div className="flex min-h-0 flex-col gap-6">
        {activeTab === "endpoint-proxy" && <EndpointPageClient machineId="" />}
        {activeTab === "mcp" && <McpDashboardPage />}
        {activeTab === "a2a" && <A2ADashboardPage />}
        {activeTab === "api-endpoints" && <ApiEndpointsTab />}
      </div>
    </div>
  );
}
