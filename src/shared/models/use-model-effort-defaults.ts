"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isModelEffort, type ModelEffort } from "@/shared/constants/reasoning-effort";
import {
  rekeyProviderModelMap,
  splitModelString,
  toPickerProviderModelKey,
} from "@/shared/models/model-string";

interface DefaultsResponse {
  custom?: Record<string, string>;
}

/**
 * Model-level reasoning-effort defaults, edited alongside a model list and written once.
 *
 * The store is global (`/api/settings/model-defaults`), not scoped to whatever form is
 * editing it: setting an effort here changes that model everywhere, including combo-routed
 * requests, which pick it up through `getDefaultParams` in the shared provider-request path.
 *
 * Only `custom` is read. Merging in `builtIn`/`effective` would show a model as already
 * configured when nothing has been set for it, and then write that value back on save.
 *
 * The store is keyed by canonical provider id; model pickers emit provider aliases. Both
 * spellings are translated at the network boundary so the map this hook hands out is keyed
 * exactly the way its callers key their model lists.
 */
export function useModelEffortDefaults({ enabled }: { enabled: boolean }) {
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, ModelEffort>>({});

  /**
   * Efforts written straight through since the open fetch started. The response is a
   * snapshot taken before those writes, so it must not be allowed to reinstate the values
   * they replaced — on a large catalog the fetch lands seconds after the list is already
   * on screen and being edited.
   */
  const writesSinceFetch = useRef<Record<string, ModelEffort>>({});

  // Refetched on every open. Unsaved edits are dropped when the form opens, not when the
  // response lands, so a reopened form starts from what the server holds without eating
  // whatever was edited while the request was still in flight.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setPending({});
    writesSinceFetch.current = {};
    fetch("/api/settings/model-defaults")
      .then((res) => (res.ok ? (res.json() as Promise<DefaultsResponse>) : { custom: {} }))
      .then((data) => {
        if (cancelled) return;
        setCustom({
          ...rekeyProviderModelMap(data.custom || {}, toPickerProviderModelKey),
          ...writesSinceFetch.current,
        });
      })
      .catch(() => {
        // Leave the map as it is; anything unwritten then reads as "inherit".
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const efforts = useMemo(() => ({ ...custom, ...pending }), [custom, pending]);

  const setEffort = useCallback((modelValue: string, effort: ModelEffort) => {
    if (!modelValue.includes("/") || !isModelEffort(effort)) return;
    setPending((prev) => ({ ...prev, [modelValue]: effort }));
  }, []);

  /** Persists pending edits, merged over the stored map. No-op when nothing changed. */
  const save = useCallback(async (): Promise<boolean> => {
    if (Object.keys(pending).length === 0) return true;
    try {
      const res = await fetch("/api/settings/model-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Only the edits: the API merges them over what it holds. Sending the whole map
        // would push back the snapshot taken when this form opened and revert anything
        // changed elsewhere since. Keys go up in picker spelling; the API canonicalizes.
        body: JSON.stringify({ defaults: pending }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as DefaultsResponse;
      Object.assign(writesSinceFetch.current, pending);
      setCustom(rekeyProviderModelMap(data.custom || {}, toPickerProviderModelKey));
      setPending({});
      return true;
    } catch {
      return false;
    }
  }, [pending]);

  /**
   * Writes one model's effort straight away, for surfaces with no save step of their own.
   * Optimistic: the value shows immediately and is rolled back if the request fails.
   */
  const saveEffort = useCallback(
    async (modelValue: string, effort: ModelEffort): Promise<boolean> => {
      const split = splitModelString(modelValue);
      if (!split || !isModelEffort(effort)) return false;

      const previous = custom[modelValue];
      setCustom((prev) => ({ ...prev, [modelValue]: effort }));
      writesSinceFetch.current[modelValue] = effort;
      try {
        const res = await fetch("/api/settings/model-defaults", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: split.providerRef,
            model: split.modelId,
            effort,
          }),
        });
        if (!res.ok) throw new Error("save failed");
        return true;
      } catch {
        delete writesSinceFetch.current[modelValue];
        setCustom((prev) => {
          const next = { ...prev };
          if (previous === undefined) delete next[modelValue];
          else next[modelValue] = previous;
          return next;
        });
        return false;
      }
    },
    [custom]
  );

  return { efforts, setEffort, saveEffort, save, hasPending: Object.keys(pending).length > 0 };
}
