"use client";

/**
 * Owns the five data fetches the model picker needs and returns the derived
 * groups. Lifted out of ModelSelectModal so the combo template resolver can
 * consume the same derivation.
 *
 * Deliberate behaviour change vs. the original component (see phase 03 / M5):
 * every fetch now carries an AbortController and the OpenRouter direct call
 * carries a timeout. The original wrote state unconditionally on resolve, and
 * `fetchLiveProviderModels` awaits sequential per-connection requests, so the
 * stale-write window was seconds. The DERIVATION is unchanged and pinned by
 * tests/unit/available-models-derivation.test.mjs.
 *
 * `connections` is a required parameter with no internal default on purpose:
 * the caller keeps ownership of its identity, so the existing re-fire semantics
 * stay exactly where they are today rather than moving invisibly into the hook.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deriveAvailableModels,
  flattenAvailableModels,
  type AvailableModel,
  type AvailableModelGroup,
  type AvailableProviderNode,
} from "./available-models";
import type { ProviderConnection } from "./provider-connection";

const OPENROUTER_DIRECT_TIMEOUT_MS = 10_000;

export interface ComboSummary {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface CustomModelEntry {
  id: string;
  name?: string;
  [key: string]: unknown;
}

export interface UseAvailableModelsParams {
  /** Fetches run only while this is true (the picker's `isOpen`). */
  enabled: boolean;
  /** Required, no default — the caller owns this array's identity. */
  connections: ProviderConnection[];
  modelAliases: Record<string, string>;
}

export interface UseAvailableModelsResult {
  groups: AvailableModelGroup[];
  models: AvailableModel[];
  combos: ComboSummary[];
  loading: boolean;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useAvailableModels({
  enabled,
  connections,
  modelAliases,
}: UseAvailableModelsParams): UseAvailableModelsResult {
  const [combos, setCombos] = useState<ComboSummary[]>([]);
  const [providerNodes, setProviderNodes] = useState<AvailableProviderNode[]>([]);
  const [customModels, setCustomModels] = useState<Record<string, CustomModelEntry[]>>({});
  const [liveModelsByProvider, setLiveModelsByProvider] = useState<
    Record<string, Array<{ id: string; name: string }>>
  >({});
  const [openrouterCatalog, setOpenrouterCatalog] = useState<{ id: string; name?: string }[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  const trackedFetch = useCallback(async (run: () => Promise<void>) => {
    setPendingCount((count) => count + 1);
    try {
      await run();
    } finally {
      setPendingCount((count) => Math.max(0, count - 1));
    }
  }, []);

  // ──────────────── /api/combos ────────────────
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();

    void trackedFetch(async () => {
      try {
        const res = await fetch("/api/combos", { signal: controller.signal });
        if (!res.ok) throw new Error(`Failed to fetch combos: ${res.status}`);
        const data = await res.json();
        if (controller.signal.aborted) return;
        setCombos(data.combos || []);
      } catch (error) {
        if (isAbort(error) || controller.signal.aborted) return;
        console.error("Error fetching combos:", error);
        setCombos([]);
      }
    });

    return () => controller.abort();
  }, [enabled, trackedFetch]);

  // ──────────────── /api/provider-nodes ────────────────
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();

    void trackedFetch(async () => {
      try {
        const res = await fetch("/api/provider-nodes", { signal: controller.signal });
        if (!res.ok) throw new Error(`Failed to fetch provider nodes: ${res.status}`);
        const data = await res.json();
        if (controller.signal.aborted) return;
        setProviderNodes(data.nodes || []);
      } catch (error) {
        if (isAbort(error) || controller.signal.aborted) return;
        console.error("Error fetching provider nodes:", error);
        setProviderNodes([]);
      }
    });

    return () => controller.abort();
  }, [enabled, trackedFetch]);

  // ──────────────── /api/provider-models ────────────────
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();

    void trackedFetch(async () => {
      try {
        const res = await fetch("/api/provider-models", { signal: controller.signal });
        if (!res.ok) throw new Error(`Failed to fetch custom models: ${res.status}`);
        const data = await res.json();
        if (controller.signal.aborted) return;
        setCustomModels(data.models || {});
      } catch (error) {
        if (isAbort(error) || controller.signal.aborted) return;
        console.error("Error fetching custom models:", error);
        setCustomModels({});
      }
    });

    return () => controller.abort();
  }, [enabled, trackedFetch]);

  // ──────────────── /api/providers/{id}/models, per provider ────────────────
  const liveControllerRef = useRef<AbortController | null>(null);

  const fetchLiveProviderModels = useCallback(
    async (signal: AbortSignal) => {
      try {
        const grouped = new Map<string, ProviderConnection[]>();
        for (const conn of connections) {
          const providerId = typeof conn?.provider === "string" ? conn.provider : "";
          if (!providerId) continue;
          const list = grouped.get(providerId) || [];
          list.push(conn);
          grouped.set(providerId, list);
        }

        const firstConnections = Array.from(grouped.entries())
          .map(([providerId, conns]) => {
            const sorted = [...conns].sort(
              (a, b) => Number(a?.priority || 0) - Number(b?.priority || 0)
            );
            return { providerId, connectionId: sorted[0]?.id };
          })
          .filter((row) => typeof row.connectionId === "string" && row.connectionId.length > 0);

        const entries = await Promise.all(
          firstConnections.map(async ({ providerId }) => {
            try {
              const providerConnections = grouped.get(providerId) || [];
              const sortedConnections = [...providerConnections].sort(
                (a, b) => Number(a?.priority || 0) - Number(b?.priority || 0)
              );

              for (const conn of sortedConnections) {
                const currentId = String(conn?.id || "");
                if (!currentId) continue;
                const res = await fetch(`/api/providers/${encodeURIComponent(currentId)}/models`, {
                  cache: "no-store",
                  signal,
                });
                if (!res.ok) continue;
                const data = await res.json().catch(() => ({}));
                const raw = Array.isArray(data?.models) ? data.models : [];
                const models = raw
                  .map((m: Record<string, unknown>) => {
                    const id = String(m?.id ?? m?.name ?? "").trim();
                    if (!id) return null;
                    return {
                      id,
                      name: String(m?.name ?? m?.display_name ?? m?.displayName ?? id).trim() || id,
                    };
                  })
                  .filter(Boolean) as Array<{ id: string; name: string }>;
                if (models.length > 0) return [providerId, models] as const;
              }

              return [providerId, []] as const;
            } catch (error) {
              if (isAbort(error)) throw error;
              return [providerId, []] as const;
            }
          })
        );

        if (signal.aborted) return;
        setLiveModelsByProvider(
          Object.fromEntries(
            entries.filter(([, models]) => Array.isArray(models) && models.length > 0)
          )
        );
      } catch (error) {
        if (isAbort(error) || signal.aborted) return;
        setLiveModelsByProvider({});
      }
    },
    [connections]
  );

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    liveControllerRef.current = controller;

    void trackedFetch(() => fetchLiveProviderModels(controller.signal));

    return () => {
      controller.abort();
      if (liveControllerRef.current === controller) liveControllerRef.current = null;
    };
  }, [enabled, fetchLiveProviderModels, trackedFetch]);

  // ──────────────── OpenRouter catalog ────────────────
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();

    const normalize = (raw: unknown[]) =>
      raw
        .map((m: unknown) => {
          if (!m || typeof m !== "object") return null;
          const obj = m as Record<string, unknown>;
          const id =
            typeof obj.id === "string" && obj.id.length > 0
              ? obj.id
              : typeof obj.canonical_slug === "string" && obj.canonical_slug.length > 0
                ? obj.canonical_slug
                : "";
          if (!id) return null;
          return { id, name: (typeof obj.name === "string" && obj.name) || id };
        })
        .filter(Boolean) as { id: string; name: string }[];

    const parsePayload = (json: Record<string, unknown>) => {
      const raw = json?.data ?? json?.models;
      return Array.isArray(raw) ? raw : [];
    };

    void trackedFetch(async () => {
      try {
        const res = await fetch("/api/models/openrouter-catalog", {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          const list = normalize(parsePayload(data));
          if (list.length > 0) {
            if (!controller.signal.aborted) setOpenrouterCatalog(list);
            return;
          }
        }
      } catch (error) {
        if (isAbort(error) || controller.signal.aborted) return;
        console.error("Error fetching OpenRouter catalog (API):", error);
      }

      if (controller.signal.aborted) return;

      // Browser → OpenRouter public API (works when server cache/API is empty; CORS allows
      // this endpoint). Timed, because on an air-gapped deploy this hangs until the
      // browser's own timeout.
      try {
        const timeoutSignal = AbortSignal.timeout(OPENROUTER_DIRECT_TIMEOUT_MS);
        const res = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, timeoutSignal]),
        });
        if (res.ok) {
          const json = await res.json();
          const list = normalize(parsePayload(json));
          if (list.length > 0) {
            if (!controller.signal.aborted) setOpenrouterCatalog(list);
            return;
          }
        }
      } catch (error) {
        if (isAbort(error) || controller.signal.aborted) return;
        console.error("Error fetching OpenRouter catalog (direct):", error);
      }

      if (!controller.signal.aborted) setOpenrouterCatalog([]);
    });

    return () => controller.abort();
  }, [enabled, trackedFetch]);

  const groups = useMemo(
    () =>
      deriveAvailableModels({
        connections,
        liveModelsByProvider,
        customModels,
        providerNodes,
        modelAliases,
        openrouterCatalog,
      }),
    [
      connections,
      liveModelsByProvider,
      customModels,
      providerNodes,
      modelAliases,
      openrouterCatalog,
    ]
  );

  const models = useMemo(() => flattenAvailableModels(groups), [groups]);

  return { groups, models, combos, loading: pendingCount > 0 };
}
