"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Model + provider selection for the chat.
 *
 * Deliberately NOT the translator's useAvailableModels/useProviderOptions:
 *   - useProviderOptions is bound to the `translator` i18n namespace, so sharing
 *     it would mean relocating keys across 32 locale files.
 *   - Neither hook can be seeded from a persisted conversation, and
 *     useProviderOptions force-resets the selection once the provider list
 *     arrives. Restoring a saved conversation would silently stomp its stored
 *     model — sending the next turn to the wrong model at the wrong price.
 *
 * This hook takes the persisted value as the initial value and never overrides
 * a user's explicit choice.
 */

interface ModelEntry {
  id: string;
  provider?: string;
}

interface UseChatModelsOptions {
  initialModel?: string | null;
  initialProvider?: string | null;
}

export function useChatModels({ initialModel, initialProvider }: UseChatModelsOptions = {}) {
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [model, setModel] = useState<string>(initialModel ?? "");
  const [provider, setProvider] = useState<string | null>(initialProvider ?? null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/models", { cache: "no-store" });
        if (!res.ok || cancelled) return;

        const data = (await res.json()) as { models?: unknown };
        if (cancelled || !Array.isArray(data.models)) return;

        const entries: ModelEntry[] = data.models
          .map((m): ModelEntry | null => {
            if (typeof m === "string") return { id: m };
            if (m && typeof m === "object") {
              const record = m as Record<string, unknown>;
              const id = record.fullModel ?? record.id ?? record.model;
              if (typeof id !== "string") return null;
              return {
                id,
                provider: typeof record.provider === "string" ? record.provider : undefined,
              };
            }
            return null;
          })
          .filter((m): m is ModelEntry => m !== null);

        setModels(entries);

        // Seed ONLY when nothing is selected. A restored conversation's model
        // must win over whatever the catalog happens to list first.
        setModel((current) => current || entries[0]?.id || "");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectModel = useCallback((next: string) => {
    setModel(next);
  }, []);

  const options = useMemo(() => models.map((m) => ({ value: m.id, label: m.id })), [models]);

  const resolvedProvider = useMemo(() => {
    if (provider) return provider;
    return models.find((m) => m.id === model)?.provider ?? null;
  }, [provider, models, model]);

  return {
    models,
    options,
    model,
    setModel: selectModel,
    provider: resolvedProvider,
    setProvider,
    loading,
  };
}
