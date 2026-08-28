import { logToolCall } from "../audit.ts";
import { normalizeQuotaResponse } from "../../../src/shared/contracts/quota.ts";
import { COMPRESSION_PRESETS, DEFAULT_COMPRESSION_PRESET } from "../../compression/preset.ts";
import { ENGINE_CATALOG } from "../../compression/engine-catalog.ts";
import { getCompressionInfoInput, listFreeTiersInput } from "../schemas/tools.ts";
import { toNumber, toRecord, toArray, toString, toStringArray } from "./helpers.ts";
import { normalizeComboModels } from "./helpers.ts";
import { routiformFetch } from "./config.ts";

export async function handleGetHealth() {
  const start = Date.now();
  try {
    const [healthRaw, resilienceRaw, rateLimitsRaw] = await Promise.allSettled([
      routiformFetch("/api/monitoring/health"),
      routiformFetch("/api/resilience"),
      routiformFetch("/api/rate-limits"),
    ]);

    const health = healthRaw.status === "fulfilled" ? toRecord(healthRaw.value) : {};
    const resilience = resilienceRaw.status === "fulfilled" ? toRecord(resilienceRaw.value) : {};
    const rateLimits = rateLimitsRaw.status === "fulfilled" ? toRecord(rateLimitsRaw.value) : {};
    const memoryUsageRaw = toRecord(health.memoryUsage);
    const cacheStatsRaw = toRecord(health.cacheStats);
    const resilienceCircuitBreakers = toArray(resilience.circuitBreakers);
    const rateLimitEntries = toArray(rateLimits.limits);

    const result = {
      uptime: toString(health.uptime, "unknown"),
      version: toString(health.version, "unknown"),
      memoryUsage: {
        heapUsed: toNumber(memoryUsageRaw.heapUsed, 0),
        heapTotal: toNumber(memoryUsageRaw.heapTotal, 0),
      },
      circuitBreakers: resilienceCircuitBreakers,
      rateLimits: rateLimitEntries,
      cacheStats:
        Object.keys(cacheStatsRaw).length > 0
          ? {
              hits: toNumber(cacheStatsRaw.hits, 0),
              misses: toNumber(cacheStatsRaw.misses, 0),
              hitRate: toNumber(cacheStatsRaw.hitRate, 0),
            }
          : undefined,
      cryptography: health.cryptography
        ? {
            status: toString(toRecord(health.cryptography).status, "missing_or_invalid"),
            provider: toString(toRecord(health.cryptography).provider, "unknown"),
          }
        : undefined,
    };

    await logToolCall("routiform_get_health", {}, result, Date.now() - start, true);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("routiform_get_health", {}, null, Date.now() - start, false, msg);
    return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
  }
}

export async function handleListCombos(args: { includeMetrics?: boolean }) {
  const start = Date.now();
  try {
    const combosRaw = await routiformFetch("/api/combos");
    const combosRecord = toRecord(combosRaw);
    const combos = Array.isArray(combosRecord.combos)
      ? combosRecord.combos
      : Array.isArray(combosRaw)
        ? combosRaw
        : [];
    let metrics: Record<string, unknown> = {};
    if (args.includeMetrics) {
      metrics = toRecord(await routiformFetch("/api/combos/metrics").catch(() => ({})));
    }

    const result = {
      combos: toArray(combos).map((rawCombo) => {
        const combo = toRecord(rawCombo);
        const comboData = toRecord(combo.data);
        const comboId = toString(combo.id, "");
        const modelsSource =
          Array.isArray(combo.models) && combo.models.length > 0 ? combo.models : comboData.models;
        return {
          id: comboId,
          name: toString(combo.name, comboId || "unnamed"),
          models: normalizeComboModels(modelsSource),
          strategy: toString(combo.strategy, toString(comboData.strategy, "priority")),
          enabled: combo.enabled !== false,
          ...(args.includeMetrics ? { metrics: metrics[comboId] ?? null } : {}),
        };
      }),
    };

    await logToolCall("routiform_list_combos", args, result, Date.now() - start, true);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("routiform_list_combos", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
  }
}

export async function handleGetComboMetrics(args: { comboId: string }) {
  const start = Date.now();
  try {
    const result = await routiformFetch(
      `/api/combos/metrics?comboId=${encodeURIComponent(args.comboId)}`
    );
    await logToolCall("routiform_get_combo_metrics", args, result, Date.now() - start, true);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("routiform_get_combo_metrics", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
  }
}

export async function handleSwitchCombo(args: { comboId: string; active: boolean }) {
  const start = Date.now();
  try {
    const result = await routiformFetch(`/api/combos/${encodeURIComponent(args.comboId)}`, {
      method: "PUT",
      body: JSON.stringify({ isActive: args.active }),
    });
    await logToolCall("routiform_switch_combo", args, result, Date.now() - start, true);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("routiform_switch_combo", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
  }
}

export async function handleCheckQuota(args: { provider?: string; connectionId?: string }) {
  const start = Date.now();
  try {
    let path = "/api/usage/quota";
    if (args.connectionId) path += `?connectionId=${encodeURIComponent(args.connectionId)}`;
    else if (args.provider) path += `?provider=${encodeURIComponent(args.provider)}`;

    const result = normalizeQuotaResponse(await routiformFetch(path), {
      provider: args.provider || null,
      connectionId: args.connectionId || null,
    });

    await logToolCall("routiform_check_quota", args, result, Date.now() - start, true);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("routiform_check_quota", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
  }
}

export async function handleRouteRequest(args: {
  model: string;
  messages: Array<{ role: string; content: string }>;
  combo?: string;
  stream?: boolean;
}) {
  const start = Date.now();
  try {
    const body: Record<string, unknown> = {
      model: args.model,
      messages: args.messages,
      stream: false, // MCP tool always returns non-streaming
    };
    if (args.combo) {
      body["x-combo"] = args.combo;
    }

    const raw = (await routiformFetch("/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify(body),
    })) as Record<string, unknown>;
    const choices = toArray(raw.choices);
    const firstChoice = toRecord(choices[0]);
    const firstMessage = toRecord(firstChoice.message);
    const usage = toRecord(raw.usage);

    const result = {
      response: {
        content: toString(firstMessage.content, ""),
        model: toString(raw.model, args.model),
        tokens: {
          prompt: toNumber(usage.prompt_tokens, 0),
          completion: toNumber(usage.completion_tokens, 0),
        },
      },
      routing: {
        provider: toString(raw.provider, "unknown"),
        combo: raw.combo ?? null,
        fallbacksTriggered: toNumber(raw.fallbacksTriggered, 0),
        cost: toNumber(raw.cost, 0),
        latencyMs: Date.now() - start,
        routingExplanation: toString(
          raw.routingExplanation,
          "Request routed through primary provider"
        ),
      },
    };

    await logToolCall(
      "routiform_route_request",
      { model: args.model, messageCount: args.messages.length },
      result.routing,
      Date.now() - start,
      true
    );
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall(
      "routiform_route_request",
      { model: args.model },
      null,
      Date.now() - start,
      false,
      msg
    );
    return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
  }
}

export async function handleCostReport(args: { period?: string }) {
  const start = Date.now();
  try {
    const period = args.period || "session";
    const rangeMap: Record<string, string> = {
      session: "1d",
      day: "1d",
      week: "7d",
      month: "30d",
    };
    const range = rangeMap[period] || "30d";
    const raw = toRecord(
      await routiformFetch(`/api/usage/analytics?range=${encodeURIComponent(range)}`)
    );
    const tokenCount = toRecord(raw.tokenCount);
    const budget = toRecord(raw.budget);

    const result = {
      period,
      totalCost: toNumber(raw.totalCost, 0),
      requestCount: toNumber(raw.requestCount, 0),
      tokenCount: {
        prompt: toNumber(tokenCount.prompt, 0),
        completion: toNumber(tokenCount.completion, 0),
      },
      byProvider: toArray(raw.byProvider),
      byModel: toArray(raw.byModel),
      budget: {
        limit: budget.limit ?? null,
        remaining: budget.remaining ?? null,
      },
    };

    await logToolCall("routiform_cost_report", args, result, Date.now() - start, true);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("routiform_cost_report", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
  }
}

export async function handleListModelsCatalog(args: { provider?: string; capability?: string }) {
  const start = Date.now();
  try {
    let path = "/v1/models";
    let isProviderSpecific = false;
    let source = "local_catalog";
    let warning: string | undefined;

    if (args.provider && !args.capability) {
      // Use direct provider fetch to get real-time API status
      path = `/api/providers/${encodeURIComponent(args.provider)}/models?excludeHidden=true`;
      isProviderSpecific = true;
    } else {
      const params = new URLSearchParams();
      if (args.provider) params.set("provider", args.provider);
      if (args.capability) params.set("capability", args.capability);
      if (params.toString()) path += `?${params.toString()}`;
    }

    const raw = toRecord(await routiformFetch(path));

    // If we used the direct provider endpoint
    let rawModels: unknown[] = [];
    if (isProviderSpecific) {
      rawModels = Array.isArray(raw.models) ? raw.models : [];
      source = typeof raw.source === "string" ? raw.source : "api";
      if (raw.warning) warning = String(raw.warning);
    } else {
      rawModels = Array.isArray(raw.data) ? raw.data : [];
      source = "local_catalog";
      // Routiform's global /v1/models is always a cached/local catalog
    }

    const result = {
      models: rawModels.map((rawModel) => {
        const model = toRecord(rawModel);
        return {
          id: toString(model.id, ""),
          provider: toString(model.owned_by, toString(model.provider, args.provider || "unknown")),
          capabilities: toStringArray(model.capabilities, ["chat"]),
          status: toString(model.status, "available"),
          pricing: model.pricing,
        };
      }),
      source,
      ...(warning ? { warning } : {}),
    };

    await logToolCall(
      "routiform_list_models_catalog",
      args,
      { modelCount: result.models.length },
      Date.now() - start,
      true
    );
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("routiform_list_models_catalog", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
  }
}

export async function handleWebSearch(args: {
  query: string;
  max_results?: number;
  search_type?: "web" | "news";
  provider?:
    | "serper-search"
    | "brave-search"
    | "perplexity-search"
    | "exa-search"
    | "tavily-search"
    | "searxng-search"
    | "duckduckgo-search";
}) {
  const start = Date.now();
  try {
    const body: Record<string, unknown> = {
      query: args.query,
      max_results: args.max_results ?? 5,
      search_type: args.search_type ?? "web",
    };
    if (args.provider) body.provider = args.provider;

    const result = await routiformFetch("/v1/search", {
      method: "POST",
      body: JSON.stringify(body),
    });
    await logToolCall("routiform_web_search", args, result, Date.now() - start, true);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("routiform_web_search", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
  }
}

export async function handleListFreeTiers(args: unknown) {
  const start = Date.now();
  try {
    const parsed = listFreeTiersInput.parse(args ?? {});
    const { FREE_TIER_CATALOG, summarizeFreeTierCatalog } =
      await import("../../../src/shared/constants/freeTierCatalog.ts");
    const summary = summarizeFreeTierCatalog();
    const entries = parsed.kind
      ? FREE_TIER_CATALOG.filter((e) => e.kind === parsed.kind)
      : [...FREE_TIER_CATALOG];
    const result = {
      ...summary,
      total: entries.length,
      entries: entries.map((e) => ({
        providerId: e.providerId,
        name: e.name,
        kind: e.kind,
        summary: e.summary,
        approxTokensPerMonth: e.approxTokensPerMonth,
        notes: e.notes,
      })),
    };
    await logToolCall("routiform_list_free_tiers", parsed, result, Date.now() - start, true);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall("routiform_list_free_tiers", args, null, Date.now() - start, false, msg);
    return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
  }
}

export async function handleGetCompressionInfo(args: unknown) {
  getCompressionInfoInput.parse(args ?? {});
  // `presets` is what a caller can configure; `resultModes` is what a response reports.
  // Advertising only the latter, as this tool used to, told callers to set values that were
  // never settable — they are the discriminator the pipeline emits, not an input vocabulary.
  const result = {
    engines: ENGINE_CATALOG,
    stage_order: "lossless engines always run before lossy ones, then the inflation guard",
    gate: "Dashboard AI request context: auto-compress | passthrough (isProxyContextCompressionEnabled)",
    presets: COMPRESSION_PRESETS,
    defaultPreset: DEFAULT_COMPRESSION_PRESET,
    resultModes: ["off", "rtk", "stacked"],
    header: "X-Routiform-Compression",
    overrideHeader: "X-Routiform-Compression-Mode",
    route: "/api/compression",
  };
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}
