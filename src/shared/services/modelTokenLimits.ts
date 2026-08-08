import { getRuntimePorts } from "@/lib/runtime/ports";

/**
 * Token limits for a set of model ids, read back from this app's own /v1/models.
 *
 * CLI tools want the limits written into their config so they can show context usage and
 * cap `max_tokens`. /v1/models is the only place that knows them for every id the router
 * publishes — combos and aliases included — so the limits are looked up there rather than
 * hardcoded per tool.
 */

export type ModelTokenLimits = {
  contextLengths: Record<string, number>;
  maxOutputTokens: Record<string, number>;
};

const EMPTY: ModelTokenLimits = { contextLengths: {}, maxOutputTokens: {} };

const positiveNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

export async function fetchModelTokenLimits(modelIds: string[]): Promise<ModelTokenLimits> {
  const ids = [...new Set(modelIds.filter(Boolean))];
  if (ids.length === 0) return EMPTY;

  const limits: ModelTokenLimits = { contextLengths: {}, maxOutputTokens: {} };

  try {
    const { apiPort } = getRuntimePorts();
    const res = await fetch(`http://127.0.0.1:${apiPort}/v1/models`);
    if (!res.ok) return limits;

    const data = await res.json();
    const catalog: Array<Record<string, unknown>> = Array.isArray(data?.data) ? data.data : [];

    for (const id of ids) {
      // /v1/models publishes prefixed ids such as "cx/gpt-5.4"; a tool may hold either form.
      const entry = catalog.find((m) => m.id === id || String(m.id).endsWith(`/${id}`));
      if (!entry) continue;

      const context = positiveNumber(entry.context_length);
      if (context) limits.contextLengths[id] = context;

      const output = positiveNumber(entry.max_output_tokens);
      if (output) limits.maxOutputTokens[id] = output;
    }
  } catch {
    // Non-fatal: a tool configured without limits still works, it just cannot show usage.
  }

  return limits;
}
