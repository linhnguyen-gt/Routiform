// Safe filter application.
// On throw: pass through the raw output unchanged + warn to stderr.
import type { FilterFn } from "./types.ts";

export function safeApply(fn: FilterFn, text: string): string {
  if (typeof fn !== "function") return text;
  try {
    const out = fn(text);
    if (typeof out !== "string") return text;
    return out;
  } catch (err) {
    // Filter threw — warn and pass through the raw output.
    const name = fn.filterName || fn.name || "anonymous";
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[rtk] warning: filter '${name}' panicked — passing through raw output: ${message}`
    );
    return text;
  }
}
