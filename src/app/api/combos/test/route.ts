import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { initTranslators } from "@routiform/open-sse/translator/index.ts";
import { handleChat } from "@/sse/handlers/chat";
import {
  buildComboTestRequestBody,
  extractComboTestResponseText,
  extractComboTestUpstreamError,
  parseComboTestHttpPayload,
} from "@/lib/combos/testHealth";
import { getComboByName } from "@/lib/localDb";
import { createLogger } from "@/shared/utils/logger";
import { testComboSchema } from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";

/** Grep: `COMBO_TEST` + `probe_http200_no_extractable_text` — combo smoke probe got 200 but no parsed assistant text. */
const comboTestProbeLog = createLogger("COMBO_TEST");

function summarizeComboProbeParsedBody(responseBody: unknown): Record<string, unknown> {
  if (responseBody == null) return { parsedShape: "null" };
  if (typeof responseBody !== "object") return { parsedShape: typeof responseBody };
  const o = responseBody as Record<string, unknown>;
  const keys = Object.keys(o).slice(0, 32);
  const choices = o.choices;
  return {
    topLevelKeys: keys,
    choicesLength: Array.isArray(choices) ? choices.length : undefined,
    object: typeof o.object === "string" ? o.object : undefined,
  };
}

let translatorInitPromise = null;
function ensureTranslatorsForComboTest() {
  if (!translatorInitPromise) {
    translatorInitPromise = Promise.resolve(initTranslators());
  }
  return translatorInitPromise;
}

/** Unit tests mock `fetch`; production uses in-process `handleChat` (no extra HTTP hop). */
function comboTestUsesHttpFetch() {
  return (
    process.env.ROUTIFORM_COMBO_TEST_USE_FETCH === "1" ||
    process.env.ROUTIFORM_COMBO_TEST_USE_FETCH === "1"
  );
}

async function testComboModel(modelStr, chatCompletionsUrl, request) {
  const startTime = Date.now();
  try {
    // Send a minimal but real chat request through the same internal
    // endpoint an external OpenAI-compatible client would use.
    const testBody = buildComboTestRequestBody(modelStr);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const cookie = request.headers.get("cookie");
    const authorization = request.headers.get("authorization");

    let res;
    try {
      const probeHeaders = {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Internal-Test": "combo-health-check",
        "X-Routiform-No-Cache": "true",
        "X-Request-Id": `combo-test-${randomUUID()}`,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(authorization ? { Authorization: authorization } : {}),
      };

      if (comboTestUsesHttpFetch()) {
        res = await fetch(chatCompletionsUrl, {
          method: "POST",
          headers: probeHeaders,
          body: JSON.stringify(testBody),
          signal: controller.signal,
        });
      } else {
        await ensureTranslatorsForComboTest();
        const innerRequest = new Request(chatCompletionsUrl, {
          method: "POST",
          headers: probeHeaders,
          body: JSON.stringify(testBody),
          signal: controller.signal,
        });
        res = await handleChat(innerRequest);
      }
    } finally {
      clearTimeout(timeout);
    }

    const latencyMs = Date.now() - startTime;

    if (res.ok) {
      const rawText = await res.text();
      const responseBody = parseComboTestHttpPayload(
        rawText,
        modelStr,
        res.headers.get("content-type") || ""
      );

      const responseText = extractComboTestResponseText(responseBody, modelStr);
      if (!responseText) {
        const embeddedErr = extractComboTestUpstreamError(responseBody, "");
        const contentType = res.headers.get("content-type") || "";
        const previewMax = 768;
        comboTestProbeLog.warn(
          {
            event: "probe_http200_no_extractable_text",
            model: modelStr,
            contentType,
            rawBytes: Buffer.byteLength(rawText, "utf8"),
            rawPreview: rawText.slice(0, previewMax),
            embeddedUpstreamError: embeddedErr || undefined,
            parsed: summarizeComboProbeParsedBody(responseBody),
          },
          "probe_http200_no_extractable_text"
        );
        return {
          model: modelStr,
          status: "error",
          statusCode: res.status,
          error:
            embeddedErr ||
            "Provider returned HTTP 200 but no assistant text (empty or unsupported response shape).",
          latencyMs,
        };
      }

      return { model: modelStr, status: "ok", latencyMs, responseText };
    }

    let errorMsg = "";
    try {
      const errBody = await res.json();
      errorMsg = extractComboTestUpstreamError(errBody, res.statusText);
    } catch {
      errorMsg = res.statusText;
    }

    return {
      model: modelStr,
      status: "error",
      statusCode: res.status,
      error: errorMsg,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    return {
      model: modelStr,
      status: "error",
      error: error.name === "AbortError" ? "Timeout (20s)" : error.message,
      latencyMs,
    };
  }
}

/**
 * POST /api/combos/test - Quick test a combo
 * Sends a real chat completion request through each model in the combo
 * and only reports success when the model returns usable text content.
 */
export async function POST(request) {
  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          message: "Invalid request",
          details: [{ field: "body", message: "Invalid JSON body" }],
        },
      },
      { status: 400 }
    );
  }

  try {
    const validation = validateBody(testComboSchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { comboName } = validation.data;

    const combo = await getComboByName(comboName);
    if (!combo) {
      return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    }

    const models = (combo.models || []).map((m) => (typeof m === "string" ? m : m.model));

    if (models.length === 0) {
      return NextResponse.json({ error: "Combo has no models" }, { status: 400 });
    }

    const chatUrl = getComboTestChatCompletionsUrl(request);
    const results = await Promise.all(
      models.map((modelStr) => testComboModel(modelStr, chatUrl, request))
    );
    const resolvedBy = results.find((result) => result.status === "ok")?.model || null;

    return NextResponse.json({
      comboName,
      strategy: combo.strategy || "priority",
      resolvedBy,
      results,
      testedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.log("Error testing combo:", error);
    return NextResponse.json({ error: "Failed to test combo" }, { status: 500 });
  }
}

/**
 * Chat completions URL for combo smoke tests.
 *
 * Must use the same origin as `request.url` (the request that hit this Next.js process), not
 * `X-Forwarded-Host`. Server-side `fetch` to a public hostname can leave the Node process (CDN /
 * edge / WAF) and return a different body shape than a direct handler — Cline often wraps large
 * `provider_metadata`; probes that round-trip through the edge sometimes yielded HTTP 200 with
 * no extractable assistant text while the dashboard message test (same browser session) showed OK.
 *
 * Use `/api/v1/chat/completions` explicitly so the App Route is targeted without relying on rewrites.
 */
function getComboTestChatCompletionsUrl(request) {
  const url = new URL(request.url);
  return `${url.origin}/api/v1/chat/completions`;
}
