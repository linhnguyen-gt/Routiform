import { APP_CONFIG } from "@/shared/constants/config";
import { APIKEY_PROVIDERS, FREE_PROVIDERS, OAUTH_PROVIDERS } from "@/shared/constants/providers";
import { useTranslations } from "next-intl";
import Link from "next/link";

const ENDPOINT_ROWS = [
  { path: "/v1/chat/completions", method: "POST", noteKey: "endpointChatNote" },
  { path: "/v1/responses", method: "POST", noteKey: "endpointResponsesNote" },
  { path: "/v1/models", method: "GET", noteKey: "endpointModelsNote" },
  { path: "/v1/embeddings", method: "POST", noteKey: "endpointEmbeddingsNote" },
  { path: "/v1/audio/transcriptions", method: "POST", noteKey: "endpointAudioNote" },
  { path: "/v1/audio/speech", method: "POST", noteKey: "endpointSpeechNote" },
  { path: "/v1/images/generations", method: "POST", noteKey: "endpointImagesNote" },
  { path: "/chat/completions", method: "POST", noteKey: "endpointRewriteChatNote" },
  { path: "/responses", method: "POST", noteKey: "endpointRewriteResponsesNote" },
  { path: "/models", method: "GET", noteKey: "endpointRewriteModelsNote" },
] as const;

const MANAGEMENT_ENDPOINT_ROWS = [
  { path: "/api/v1/management/proxies", method: "GET", noteKey: "mgmtProxiesListNote" },
  { path: "/api/v1/management/proxies", method: "POST", noteKey: "mgmtProxiesCreateNote" },
  {
    path: "/api/v1/management/proxies/health",
    method: "GET",
    noteKey: "mgmtProxiesHealthNote",
  },
  {
    path: "/api/v1/management/proxies/bulk-assign",
    method: "PUT",
    noteKey: "mgmtProxiesBulkAssignNote",
  },
  {
    path: "/api/v1/management/proxies/assignments",
    method: "GET",
    noteKey: "mgmtAssignmentsListNote",
  },
  {
    path: "/api/v1/management/proxies/assignments",
    method: "PUT",
    noteKey: "mgmtAssignmentsUpdateNote",
  },
  {
    path: "/api/settings/proxies/migrate",
    method: "POST",
    noteKey: "mgmtLegacyMigrationNote",
  },
] as const;

const FEATURE_ITEMS = [
  { icon: "hub", titleKey: "featureRoutingTitle", textKey: "featureRoutingText" },
  { icon: "layers", titleKey: "featureCombosTitle", textKey: "featureCombosText" },
  { icon: "bar_chart", titleKey: "featureUsageTitle", textKey: "featureUsageText" },
  { icon: "analytics", titleKey: "featureAnalyticsTitle", textKey: "featureAnalyticsText" },
  { icon: "health_and_safety", titleKey: "featureHealthTitle", textKey: "featureHealthText" },
  { icon: "terminal", titleKey: "featureCliTitle", textKey: "featureCliText" },
  { icon: "shield", titleKey: "featureSecurityTitle", textKey: "featureSecurityText" },
  { icon: "cloud_sync", titleKey: "featureCloudSyncTitle", textKey: "featureCloudSyncText" },
] as const;

const USE_CASE_ITEMS = [
  { titleKey: "useCaseSingleEndpointTitle", textKey: "useCaseSingleEndpointText" },
  { titleKey: "useCaseFallbackTitle", textKey: "useCaseFallbackText" },
  { titleKey: "useCaseUsageVisibilityTitle", textKey: "useCaseUsageVisibilityText" },
] as const;

const TROUBLESHOOTING_KEYS = [
  "troubleshootingModelRouting",
  "troubleshootingAmbiguousModels",
  "troubleshootingCodexFamily",
  "troubleshootingTestConnection",
  "troubleshootingCircuitBreaker",
  "troubleshootingOAuth",
] as const;

const TOC_ITEMS = [
  { href: "#quick-start", labelKey: "quickStart", icon: "rocket_launch" },
  { href: "#features", labelKey: "features", icon: "dashboard_customize" },
  { href: "#supported-providers", labelKey: "supportedProvidersToc", icon: "account_tree" },
  { href: "#use-cases", labelKey: "commonUseCases", icon: "deployed_code" },
  { href: "#client-compatibility", labelKey: "clientCompatibility", icon: "devices" },
  { href: "#protocols", labelKey: "protocolsToc", icon: "lan" },
  { href: "#api-reference", labelKey: "apiReference", icon: "api" },
  { href: "#management-api", labelKey: "managementApiReference", icon: "tune" },
  { href: "#model-prefixes", labelKey: "modelPrefixes", icon: "tag" },
  { href: "#troubleshooting", labelKey: "troubleshooting", icon: "help" },
] as const;

interface ProviderEntry {
  id: string;
  name: string;
  alias?: string;
}

function SectionCard({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-[28px] border border-border/60 bg-surface/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur sm:p-8"
    >
      <div className="mb-6 flex flex-col gap-2 border-b border-border/50 pb-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-muted">
          {id.replace(/-/g, " ")}
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-text-main">{title}</h2>
        {description ? (
          <p className="max-w-3xl text-sm leading-6 text-text-muted">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/50 bg-white/65 p-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)] backdrop-blur dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none">
      <div className="text-2xl font-semibold tracking-tight text-text-main">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-text-muted">{label}</div>
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  const tone =
    method === "GET"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : method === "POST"
        ? "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
        : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";

  return (
    <span
      className={`inline-flex min-w-[56px] items-center justify-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.18em] ${tone}`}
    >
      {method}
    </span>
  );
}

function TableCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ path: string; method: string; note: string }>;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-bg">
      <div className="border-b border-border/50 px-4 py-3 text-sm font-semibold text-text-main">
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-bg-subtle/70 text-left text-xs uppercase tracking-[0.18em] text-text-muted">
            <tr>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Path</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.method}:${row.path}`} className="border-t border-border/40 align-top">
                <td className="px-4 py-3">
                  <MethodBadge method={row.method} />
                </td>
                <td className="px-4 py-3 font-mono text-[13px] text-text-main">{row.path}</td>
                <td className="px-4 py-3 leading-6 text-text-muted">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProviderTable({
  title,
  providers,
  colorDot,
  countLabel,
  className = "",
}: {
  title: string;
  providers: Record<string, ProviderEntry>;
  colorDot: string;
  countLabel: string;
  className?: string;
}) {
  const entries = Object.values(providers);

  return (
    <div className={`rounded-2xl border border-border/60 bg-bg p-4 shadow-sm ${className}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border/50 pb-3">
        <span className={`size-2.5 rounded-full ${colorDot}`} />
        <h3 className="text-sm font-semibold text-text-main">{title}</h3>
        <span className="ml-auto rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-text-muted">
          {countLabel}
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        {entries.map((p) => (
          <div
            key={p.id}
            className="flex min-w-0 flex-col gap-2 rounded-xl border border-border/40 bg-bg-subtle/30 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="break-words text-sm font-medium text-text-main">{p.name}</div>
              <div className="mt-0.5 break-all text-xs text-text-muted">{p.id}</div>
            </div>
            <code className="max-w-full self-start whitespace-normal break-all rounded-md bg-bg px-2 py-1 text-[11px] text-text-muted sm:ml-3 sm:max-w-[128px] sm:self-auto sm:truncate sm:whitespace-nowrap sm:break-normal">
              {(p.alias || p.id) + "/"}
            </code>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DocsPage() {
  const t = useTranslations("docs");

  const totalProviders =
    Object.keys(FREE_PROVIDERS).length +
    Object.keys(OAUTH_PROVIDERS).length +
    Object.keys(APIKEY_PROVIDERS).length;

  const endpointRows = ENDPOINT_ROWS.map((row) => ({
    ...row,
    note: t(row.noteKey),
  }));
  const managementEndpointRows = MANAGEMENT_ENDPOINT_ROWS.map((row) => ({
    ...row,
    note: t(row.noteKey),
  }));

  const featureItems = FEATURE_ITEMS.map((item) => ({
    ...item,
    title: t(item.titleKey),
    text: t(item.textKey),
  }));

  const useCases = USE_CASE_ITEMS.map((item) => ({
    ...item,
    title: t(item.titleKey),
    text: t(item.textKey),
  }));

  const troubleshootingItems = TROUBLESHOOTING_KEYS.map((key) => t(key));
  const tocItems = TOC_ITEMS.map((item) => ({ ...item, label: t(item.labelKey) }));

  const providerPrefixRows = [
    ...Object.values(FREE_PROVIDERS).map((p) => ({ ...p, type: "free" as const })),
    ...Object.values(OAUTH_PROVIDERS).map((p) => ({ ...p, type: "oauth" as const })),
    ...Object.values(APIKEY_PROVIDERS).map((p) => ({ ...p, type: "apiKey" as const })),
  ];

  const getProviderTypeLabel = (type: "free" | "oauth" | "apiKey") => {
    if (type === "free") return t("providerTypeFree");
    if (type === "oauth") return t("providerTypeOAuth");
    return t("providerTypeApiKey");
  };

  const providerTypePillClass = (type: "free" | "oauth" | "apiKey") => {
    if (type === "free") {
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    }
    if (type === "oauth") {
      return "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300";
    }
    return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(37,99,235,0.06),transparent_18%),linear-gradient(180deg,#f8fafc_0%,#ffffff_18%,#f8fafc_100%)] text-text-main dark:bg-[linear-gradient(180deg,rgba(37,99,235,0.12),transparent_20%),linear-gradient(180deg,#020617_0%,#020617_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <header className="relative overflow-hidden rounded-[32px] border border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.12),transparent_32%)] p-6 shadow-[0_30px_80px_rgba(15,23,42,0.08)] sm:p-8 lg:p-10">
          <div
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.72),rgba(255,255,255,0.3))] dark:bg-[linear-gradient(135deg,rgba(2,6,23,0.84),rgba(2,6,23,0.56))]"
            aria-hidden
          />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)] lg:items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-white/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-text-muted backdrop-blur dark:bg-white/[0.06]">
                <span className="size-2 rounded-full bg-primary" />
                {t("documentationVersion", { version: APP_CONFIG.version })}
              </div>
              <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight text-text-main sm:text-5xl">
                {APP_CONFIG.name} {t("docsLabel")}
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-text-muted sm:text-lg">
                {t("docsHeroDescription")}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-primary/90"
                >
                  {t("openDashboard")}
                </Link>
                <Link
                  href="/dashboard/endpoint"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border/60 bg-white/75 px-4 py-2.5 text-sm font-medium text-text-main transition-colors hover:bg-white dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
                >
                  {t("endpointPage")}
                </Link>
                <a
                  href="https://github.com/linhnguyen-gt/Routiform"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-white/75 px-4 py-2.5 text-sm font-medium text-text-main transition-colors hover:bg-white dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
                >
                  {t("github")}
                  <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                </a>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <StatCard value={`${totalProviders}+`} label={t("supportedProviders")} />
                <StatCard value={String(endpointRows.length)} label={t("apiReference")} />
                <StatCard value="2" label={t("protocolsTitle")} />
              </div>
            </div>

            <div className="rounded-[28px] border border-white/50 bg-white/70 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur dark:border-white/10 dark:bg-white/[0.05] dark:shadow-none">
              <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                    {t("quickStart")}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-text-main">
                    {t("apiReference")}
                  </div>
                </div>
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  /v1
                </span>
              </div>

              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-border/50 bg-[#0f172a] p-4 text-slate-100 shadow-sm">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                    {t("quickStartStep1Title")}
                  </div>
                  <code className="block overflow-x-auto whitespace-nowrap font-mono text-sm">
                    npx routiform
                  </code>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/50 bg-bg p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                      {t("endpointPage")}
                    </div>
                    <code className="mt-2 block overflow-x-auto whitespace-nowrap rounded-lg bg-bg-subtle px-3 py-2 font-mono text-[13px] text-text-main">
                      https://&lt;host&gt;/v1
                    </code>
                  </div>
                  <div className="rounded-2xl border border-border/50 bg-bg p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                      {t("modelPrefixes")}
                    </div>
                    <code className="mt-2 block overflow-x-auto whitespace-nowrap rounded-lg bg-bg-subtle px-3 py-2 font-mono text-[13px] text-text-main">
                      gh/gpt-5.3-codex
                    </code>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/50 bg-bg p-4 text-sm text-text-muted">
                  <div className="font-medium text-text-main">{t("clientCompatibility")}</div>
                  <p className="mt-1 leading-6">{t("clientClaudeBullet1Prefix")}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-8 xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="xl:sticky xl:top-24 xl:self-start">
            <div className="rounded-[28px] border border-border/60 bg-surface/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur">
              <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-text-muted">
                {t("onThisPage")}
              </h2>
              <nav className="mt-4 flex flex-col gap-2" aria-label={t("onThisPage")}>
                {tocItems.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="group flex min-h-11 items-center gap-3 rounded-2xl border border-border/50 bg-bg px-3.5 py-2 text-sm text-text-muted transition-colors hover:border-primary/30 hover:text-text-main"
                  >
                    <span className="material-symbols-outlined text-[18px] text-primary/70 transition-transform duration-200 group-hover:translate-x-0.5">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </a>
                ))}
              </nav>

              <div className="mt-5 rounded-2xl border border-border/50 bg-bg px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  {t("reportIssue")}
                </div>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  {t("protocolTroubleshootingTitle")}
                </p>
                <a
                  href="https://github.com/linhnguyen-gt/Routiform/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-border/60 px-3.5 py-2 text-sm font-medium text-text-main transition-colors hover:bg-bg-subtle"
                >
                  {t("reportIssue")}
                </a>
              </div>
            </div>
          </aside>

          <main className="flex min-w-0 flex-col gap-8">
            <SectionCard
              id="quick-start"
              title={t("quickStart")}
              description={t("quickStartStep2Text")}
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
                <div className="grid gap-3 sm:grid-cols-2">
                  <article className="rounded-2xl border border-border/60 bg-bg p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                      01
                    </div>
                    <h3 className="mt-2 text-base font-semibold text-text-main">
                      {t("quickStartStep1Title")}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-text-muted">
                      {t("quickStartStep1Prefix")}{" "}
                      <code className="rounded bg-bg-subtle px-1.5 py-0.5">npx routiform</code>{" "}
                      {t("quickStartStep1Middle")}{" "}
                      <code className="rounded bg-bg-subtle px-1.5 py-0.5">npm start</code>.
                    </p>
                  </article>
                  <article className="rounded-2xl border border-border/60 bg-bg p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                      02
                    </div>
                    <h3 className="mt-2 text-base font-semibold text-text-main">
                      {t("quickStartStep2Title")}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-text-muted">
                      {t("quickStartStep2Text")}
                    </p>
                  </article>
                  <article className="rounded-2xl border border-border/60 bg-bg p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                      03
                    </div>
                    <h3 className="mt-2 text-base font-semibold text-text-main">
                      {t("quickStartStep3Title")}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-text-muted">
                      {t("quickStartStep3Text")}
                    </p>
                  </article>
                  <article className="rounded-2xl border border-border/60 bg-bg p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                      04
                    </div>
                    <h3 className="mt-2 text-base font-semibold text-text-main">
                      {t("quickStartStep4Title")}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-text-muted">
                      {t("quickStartStep4Prefix")}{" "}
                      <code className="rounded bg-bg-subtle px-1.5 py-0.5">
                        https://&lt;host&gt;/v1
                      </code>
                      . {t("quickStartStep4Suffix")}{" "}
                      <code className="rounded bg-bg-subtle px-1.5 py-0.5">gh/gpt-5.3-codex</code>.
                    </p>
                  </article>
                </div>

                <div className="rounded-[24px] border border-border/60 bg-[#0b1220] p-5 text-slate-100 shadow-[0_20px_50px_rgba(2,6,23,0.22)]">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-rose-400" />
                    <span className="size-2 rounded-full bg-amber-400" />
                    <span className="size-2 rounded-full bg-emerald-400" />
                  </div>
                  <div className="mt-4 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                    {t("apiReference")}
                  </div>
                  <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-[13px] leading-6 text-slate-100">
                    <code>{`BASE_URL=https://<host>/v1

POST $BASE_URL/chat/completions
POST $BASE_URL/responses
GET  $BASE_URL/models

model: gh/gpt-5.3-codex`}</code>
                  </pre>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                        {t("protocolsTitle")}
                      </div>
                      <div className="mt-2 text-sm font-medium text-slate-100">MCP + A2A</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                        {t("supportedProviders")}
                      </div>
                      <div className="mt-2 text-sm font-medium text-slate-100">
                        {totalProviders}+ {t("providersCount", { count: totalProviders })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard id="features" title={t("features")}>
              <div className="grid gap-4 md:grid-cols-2">
                {featureItems.map((item) => (
                  <article
                    key={item.titleKey}
                    className="group rounded-2xl border border-border/60 bg-bg p-4 transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
                        <span className="material-symbols-outlined text-[21px]">{item.icon}</span>
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-text-main">{item.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-text-muted">{item.text}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              id="supported-providers"
              title={t("supportedProviders")}
              description={t("providersAcrossConnectionTypes", { count: totalProviders })}
            >
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex flex-wrap gap-2">
                  <span className="rounded-full border border-border/60 bg-bg px-3 py-1 text-xs text-text-muted">
                    {totalProviders}+ {t("supportedProviders")}
                  </span>
                  <span className="rounded-full border border-border/60 bg-bg px-3 py-1 text-xs text-text-muted">
                    {Object.keys(OAUTH_PROVIDERS).length} {t("providerTypeOAuth")}
                  </span>
                  <span className="rounded-full border border-border/60 bg-bg px-3 py-1 text-xs text-text-muted">
                    {Object.keys(APIKEY_PROVIDERS).length} {t("providerTypeApiKey")}
                  </span>
                </div>
                <Link
                  href="/dashboard/providers"
                  className="inline-flex min-h-11 items-center rounded-xl border border-border/60 bg-bg px-4 py-2.5 text-sm font-medium text-text-main transition-colors hover:bg-bg-subtle"
                >
                  {t("manageProviders")}
                </Link>
              </div>

              <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                <ProviderTable
                  title={t("providerTypeFree")}
                  providers={FREE_PROVIDERS}
                  colorDot="bg-emerald-500"
                  countLabel={t("providersCount", { count: Object.keys(FREE_PROVIDERS).length })}
                />
                <ProviderTable
                  title={t("providerTypeOAuth")}
                  providers={OAUTH_PROVIDERS}
                  colorDot="bg-blue-500"
                  countLabel={t("providersCount", { count: Object.keys(OAUTH_PROVIDERS).length })}
                />
                <ProviderTable
                  title={t("providerTypeApiKey")}
                  providers={APIKEY_PROVIDERS}
                  colorDot="bg-amber-500"
                  countLabel={t("providersCount", { count: Object.keys(APIKEY_PROVIDERS).length })}
                  className="xl:col-span-2 2xl:col-span-1"
                />
              </div>
            </SectionCard>

            <SectionCard id="use-cases" title={t("commonUseCases")}>
              <div className="grid gap-4 md:grid-cols-3">
                {useCases.map((item, index) => (
                  <article
                    key={item.titleKey}
                    className="rounded-2xl border border-border/60 bg-bg p-5"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                      0{index + 1}
                    </div>
                    <h3 className="mt-3 text-lg font-semibold tracking-tight text-text-main">
                      {item.title}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-text-muted">{item.text}</p>
                  </article>
                ))}
              </div>
            </SectionCard>

            <SectionCard id="client-compatibility" title={t("clientCompatibility")}>
              <div className="grid gap-4 lg:grid-cols-2">
                <article className="rounded-2xl border border-border/60 bg-bg p-5">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">deployed_code</span>
                    <h3 className="text-base font-semibold text-text-main">
                      {t("clientCherryStudioTitle")}
                    </h3>
                  </div>
                  <ul className="mt-4 space-y-2 text-sm leading-6 text-text-muted">
                    <li>
                      {t("baseUrlLabel")}:{" "}
                      <code className="rounded bg-bg-subtle px-1.5 py-0.5">
                        https://&lt;host&gt;/v1
                      </code>
                    </li>
                    <li>
                      {t("chatEndpointLabel")}:{" "}
                      <code className="rounded bg-bg-subtle px-1.5 py-0.5">/chat/completions</code>
                    </li>
                    <li>
                      {t("modelRecommendationLabel")} (
                      <code className="rounded bg-bg-subtle px-1.5 py-0.5">gh/...</code>,{" "}
                      <code className="rounded bg-bg-subtle px-1.5 py-0.5">cc/...</code>)
                    </li>
                  </ul>
                </article>

                <article className="rounded-2xl border border-border/60 bg-bg p-5">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">terminal</span>
                    <h3 className="text-base font-semibold text-text-main">
                      {t("clientCodexTitle")}
                    </h3>
                  </div>
                  <ul className="mt-4 space-y-2 text-sm leading-6 text-text-muted">
                    <li>
                      {t("clientCodexBullet1")}{" "}
                      <code className="rounded bg-bg-subtle px-1.5 py-0.5">gh/</code>.
                    </li>
                    <li>
                      {t("clientCodexBullet2")}{" "}
                      <code className="rounded bg-bg-subtle px-1.5 py-0.5">/responses</code>.
                    </li>
                    <li>
                      {t("clientCodexBullet3")}{" "}
                      <code className="rounded bg-bg-subtle px-1.5 py-0.5">/chat/completions</code>.
                    </li>
                  </ul>
                </article>

                <article className="rounded-2xl border border-border/60 bg-bg p-5">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">left_click</span>
                    <h3 className="text-base font-semibold text-text-main">
                      {t("clientCursorTitle")}
                    </h3>
                  </div>
                  <ul className="mt-4 space-y-2 text-sm leading-6 text-text-muted">
                    <li>
                      {t("clientCursorBullet1")}{" "}
                      <code className="rounded bg-bg-subtle px-1.5 py-0.5">cu/</code>{" "}
                      {t("clientCursorBullet1Suffix")}
                    </li>
                    <li>{t("clientCursorBullet2")}</li>
                    <li>{t("supportsChat")}</li>
                  </ul>
                </article>

                <article className="rounded-2xl border border-border/60 bg-bg p-5">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">smart_toy</span>
                    <h3 className="text-base font-semibold text-text-main">
                      {t("clientClaudeTitle")}
                    </h3>
                  </div>
                  <ul className="mt-4 space-y-2 text-sm leading-6 text-text-muted">
                    <li>
                      {t("clientClaudeBullet1Prefix")}{" "}
                      <code className="rounded bg-bg-subtle px-1.5 py-0.5">cc/</code>{" "}
                      {t("clientClaudeBullet1Middle")}{" "}
                      <code className="rounded bg-bg-subtle px-1.5 py-0.5">antigravity/</code>{" "}
                      {t("clientClaudeBullet1Suffix")}
                    </li>
                    <li>{t("oauthAutoRefresh")}</li>
                    <li>{t("fullStreaming")}</li>
                  </ul>
                </article>
              </div>
            </SectionCard>

            <SectionCard
              id="protocols"
              title={t("protocolsTitle")}
              description={t("protocolsDescription")}
            >
              <div className="grid gap-4 xl:grid-cols-2">
                <article className="rounded-2xl border border-border/60 bg-bg p-5">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">
                      settings_ethernet
                    </span>
                    <h3 className="text-lg font-semibold text-text-main">
                      {t("protocolMcpTitle")}
                    </h3>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-text-muted">{t("protocolMcpDesc")}</p>
                  <ol className="mt-4 space-y-2 text-sm leading-6 text-text-muted">
                    <li>1. {t("protocolMcpStep1")}</li>
                    <li>2. {t("protocolMcpStep2")}</li>
                    <li>3. {t("protocolMcpStep3")}</li>
                  </ol>
                  <pre className="mt-4 overflow-x-auto rounded-2xl border border-border/60 bg-bg-subtle p-4 text-xs">
                    <code>{`routiform --mcp`}</code>
                  </pre>
                </article>

                <article className="rounded-2xl border border-border/60 bg-bg p-5">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">lan</span>
                    <h3 className="text-lg font-semibold text-text-main">
                      {t("protocolA2aTitle")}
                    </h3>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-text-muted">{t("protocolA2aDesc")}</p>
                  <ol className="mt-4 space-y-2 text-sm leading-6 text-text-muted">
                    <li>1. {t("protocolA2aStep1")}</li>
                    <li>2. {t("protocolA2aStep2")}</li>
                    <li>3. {t("protocolA2aStep3")}</li>
                  </ol>
                  <pre className="mt-4 overflow-x-auto rounded-2xl border border-border/60 bg-bg-subtle p-4 text-xs">
                    <code>{`GET /.well-known/agent.json
POST /a2a  (JSON-RPC: message/send | message/stream)`}</code>
                  </pre>
                </article>
              </div>

              <div className="mt-4 rounded-2xl border border-border/60 bg-bg p-5">
                <h3 className="text-base font-semibold text-text-main">
                  {t("protocolTroubleshootingTitle")}
                </h3>
                <ul className="mt-3 grid gap-2 text-sm leading-6 text-text-muted md:grid-cols-3">
                  <li className="rounded-xl border border-border/40 bg-bg-subtle/30 px-3 py-2">
                    {t("protocolTroubleshooting1")}
                  </li>
                  <li className="rounded-xl border border-border/40 bg-bg-subtle/30 px-3 py-2">
                    {t("protocolTroubleshooting2")}
                  </li>
                  <li className="rounded-xl border border-border/40 bg-bg-subtle/30 px-3 py-2">
                    {t("protocolTroubleshooting3")}
                  </li>
                </ul>
              </div>
            </SectionCard>

            <SectionCard id="api-reference" title={t("apiReference")}>
              <TableCard title={t("apiReference")} rows={endpointRows} />
            </SectionCard>

            <SectionCard
              id="model-prefixes"
              title={t("modelPrefixes")}
              description={`${t("modelPrefixesDescriptionStart")} gh/gpt-5.3-codex ${t("modelPrefixesDescriptionEnd")}`}
            >
              <div className="overflow-hidden rounded-2xl border border-border/60 bg-bg">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead className="bg-bg-subtle/70 text-left text-xs uppercase tracking-[0.18em] text-text-muted">
                      <tr>
                        <th className="px-4 py-3">{t("prefix")}</th>
                        <th className="px-4 py-3">{t("provider")}</th>
                        <th className="px-4 py-3">{t("type")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {providerPrefixRows.map((p) => (
                        <tr key={p.id} className="border-t border-border/40">
                          <td className="px-4 py-3 font-mono">
                            <code className="rounded bg-bg-subtle px-1.5 py-0.5">{p.alias}/</code>
                          </td>
                          <td className="px-4 py-3 text-text-main">{p.name}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${providerTypePillClass(p.type)}`}
                            >
                              <span className="size-1.5 rounded-full bg-current" />
                              {getProviderTypeLabel(p.type)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              id="management-api"
              title={t("managementApiReference")}
              description={t("managementApiDescription")}
            >
              <TableCard title={t("managementApiReference")} rows={managementEndpointRows} />
            </SectionCard>

            <SectionCard id="troubleshooting" title={t("troubleshooting")}>
              <div className="grid gap-3 md:grid-cols-2">
                {troubleshootingItems.map((item, index) => (
                  <div
                    key={item}
                    className="flex gap-3 rounded-2xl border border-border/60 bg-bg p-4"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </div>
                    <p className="text-sm leading-6 text-text-muted">{item}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          </main>
        </div>
      </div>
    </div>
  );
}
