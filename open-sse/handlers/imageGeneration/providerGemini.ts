import { saveCallLog } from "@/lib/usageDb";
import { IMAGE_SUBMIT_TIMEOUT_MS, imageProviderErrorResponse } from "./shared.ts";
/**
 * Handle Gemini-format image generation (Antigravity / Nano Banana)
 * Uses Gemini's generateContent API with responseModalities: ["TEXT", "IMAGE"]
 */
export async function handleGeminiImageGeneration({
  model,
  providerConfig,
  body,
  credentials,
  log,
  callLog = true,
}) {
  const startTime = Date.now();
  const url = `${providerConfig.baseUrl}/${model}:generateContent`;
  const provider = "antigravity";

  // Summarized request for call log
  const logRequestBody = {
    model: body.model,
    prompt:
      typeof body.prompt === "string"
        ? body.prompt.slice(0, 200)
        : String(body.prompt ?? "").slice(0, 200),
    size: body.size || "default",
    n: body.n || 1,
  };

  const geminiBody = {
    contents: [
      {
        parts: [{ text: body.prompt }],
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  };

  const token = credentials.accessToken || credentials.apiKey;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  if (log) {
    const promptPreview =
      typeof body.prompt === "string"
        ? body.prompt.slice(0, 60)
        : String(body.prompt ?? "").slice(0, 60);
    log.info(
      "IMAGE",
      `antigravity/${model} (gemini) | prompt: "${promptPreview}..." | format: gemini-image`
    );
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(geminiBody),
      signal: AbortSignal.timeout(IMAGE_SUBMIT_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (log) {
        log.error("IMAGE", `antigravity error ${response.status}: ${errorText.slice(0, 200)}`);
      }

      if (callLog) {
        saveCallLog({
          method: "POST",
          path: "/v1/images/generations",
          status: response.status,
          model: `antigravity/${model}`,
          provider,
          duration: Date.now() - startTime,
          error: errorText.slice(0, 500),
          requestBody: logRequestBody,
        }).catch(() => {});
      }

      return imageProviderErrorResponse(provider, response.status);
    }

    const data = await response.json();

    // Extract image data from Gemini response
    const images = [];
    const candidates = data.candidates || [];
    for (const candidate of candidates) {
      const parts = candidate.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData) {
          images.push({
            b64_json: part.inlineData.data,
            revised_prompt: parts.find((p) => p.text)?.text || body.prompt,
          });
        }
      }
    }

    if (callLog) {
      saveCallLog({
        method: "POST",
        path: "/v1/images/generations",
        status: 200,
        model: `antigravity/${model}`,
        provider,
        duration: Date.now() - startTime,
        tokens: { prompt_tokens: 0, completion_tokens: 0 },
        requestBody: logRequestBody,
        responseBody: { images_count: images.length },
      }).catch(() => {});
    }

    return {
      success: true,
      data: {
        created: Math.floor(Date.now() / 1000),
        data: images,
      },
    };
  } catch (err) {
    if (log) {
      log.error("IMAGE", `antigravity fetch error: ${err.message}`);
    }

    if (callLog) {
      saveCallLog({
        method: "POST",
        path: "/v1/images/generations",
        status: 502,
        model: `antigravity/${model}`,
        provider,
        duration: Date.now() - startTime,
        error: err.message,
        requestBody: logRequestBody,
      }).catch(() => {});
    }

    return imageProviderErrorResponse("antigravity", 502);
  }
}
