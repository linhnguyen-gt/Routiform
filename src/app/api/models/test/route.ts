import { NextResponse } from "next/server";
import { getApiKeys } from "@/models";
import { modelTestRouteSchema } from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/models/test — Send a minimal chat completion via the unified API to verify routing for a model id.
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const validation = validateBody(modelTestRouteSchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json(validation.error, { status: 400 });
    }
    const { model } = validation.data;

    const baseUrl =
      process.env.BASE_URL ||
      (() => {
        const u = new URL(request.url);
        return `${u.protocol}//${u.host}`;
      })();

    let apiKey: string | null = null;
    try {
      const keys = await getApiKeys();
      const rawKey = keys.find((k) => k.isActive !== false)?.key;
      apiKey = typeof rawKey === "string" ? rawKey : null;
    } catch {
      // optional auth
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const start = Date.now();
    const res = await fetch(`${baseUrl}/api/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 1,
        stream: false,
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    const latencyMs = Date.now() - start;

    const rawText = await res.text().catch(() => "");
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      const errObj = parsed?.error as Record<string, unknown> | undefined;
      const detail =
        (typeof errObj?.message === "string" && errObj.message) ||
        (typeof parsed?.msg === "string" && parsed.msg) ||
        (typeof parsed?.message === "string" && parsed.message) ||
        (typeof parsed?.error === "string" && parsed.error) ||
        rawText;
      const error = `HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 240)}` : ""}`;
      return NextResponse.json({ ok: false, latencyMs, error, status: res.status });
    }

    const providerStatus = parsed?.status;
    const providerMsg =
      (typeof parsed?.msg === "string" && parsed.msg) ||
      (typeof parsed?.message === "string" && parsed.message);
    const hasProviderErrorStatus =
      providerStatus !== undefined &&
      providerStatus !== null &&
      String(providerStatus) !== "200" &&
      String(providerStatus) !== "0";
    if (hasProviderErrorStatus && providerMsg) {
      return NextResponse.json({
        ok: false,
        latencyMs,
        status: res.status,
        error: `Provider status ${String(providerStatus)}: ${String(providerMsg).slice(0, 240)}`,
      });
    }

    if (parsed?.error) {
      const errNested = parsed.error as Record<string, unknown> | string;
      const providerError =
        (typeof errNested === "object" &&
          errNested !== null &&
          typeof errNested.message === "string" &&
          errNested.message) ||
        (typeof errNested === "string" ? errNested : null) ||
        "Provider returned an error";
      return NextResponse.json({
        ok: false,
        latencyMs,
        status: res.status,
        error: String(providerError).slice(0, 240),
      });
    }

    const choices = parsed?.choices;
    const hasChoices = Array.isArray(choices) && choices.length > 0;
    if (!hasChoices) {
      return NextResponse.json({
        ok: false,
        latencyMs,
        status: res.status,
        error: "Provider returned no completion choices for this model",
      });
    }

    return NextResponse.json({ ok: true, latencyMs, error: null, status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
