"use client";

import { useEffect, useRef } from "react";

interface VisiblePollingOptions {
  enabled?: boolean;
  intervalMs: number;
  runOnMount?: boolean;
  runOnVisible?: boolean;
}

export function useVisiblePolling(
  callback: () => void | Promise<void>,
  { enabled = true, intervalMs, runOnMount = true, runOnVisible = true }: VisiblePollingOptions
) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let inFlight = false;
    let stopped = false;

    const run = async () => {
      if (stopped || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        await callbackRef.current();
      } catch {
        // Poll callbacks own their error UI; keep the interval alive on unexpected failures.
      } finally {
        inFlight = false;
      }
    };

    if (runOnMount) {
      queueMicrotask(() => void run());
    }

    const interval = window.setInterval(() => void run(), intervalMs);
    const handleVisibilityChange = () => {
      if (runOnVisible && document.visibilityState === "visible") {
        void run();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, intervalMs, runOnMount, runOnVisible]);
}
