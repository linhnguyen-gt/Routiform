import { IMAGE_DOWNLOAD_TIMEOUT_MS } from "./shared.ts";
export function normalizeNanoBananaSyncPayload(data, prompt) {
  const images = [];

  if (data.image) {
    images.push({ b64_json: data.image, revised_prompt: prompt });
  } else if (Array.isArray(data.images)) {
    for (const img of data.images) {
      images.push({
        b64_json: typeof img === "string" ? img : img?.image || img?.data,
        revised_prompt: prompt,
      });
    }
  } else if (Array.isArray(data.data)) {
    for (const img of data.data) {
      if (!img) continue;
      images.push(img);
    }
  }

  return { data: images.filter(Boolean) };
}

export async function normalizeNanoBananaTaskResult(taskData, body, log) {
  const response = taskData?.response || {};

  const urlCandidates = [
    response?.resultImageUrl,
    response?.originImageUrl,
    taskData?.resultImageUrl,
    taskData?.originImageUrl,
  ].filter((v) => typeof v === "string" && v.length > 0);

  if (Array.isArray(response?.resultImageUrls)) {
    for (const u of response.resultImageUrls) {
      if (typeof u === "string" && u.length > 0) urlCandidates.push(u);
    }
  }

  const b64Candidates = [
    response?.resultImageBase64,
    response?.resultImage,
    taskData?.resultImageBase64,
    taskData?.resultImage,
  ].filter((v) => typeof v === "string" && v.length > 0);

  if (Array.isArray(response?.resultImageBase64List)) {
    for (const b64 of response.resultImageBase64List) {
      if (typeof b64 === "string" && b64.length > 0) b64Candidates.push(b64);
    }
  }

  const wantsBase64 = body.response_format === "b64_json";

  if (wantsBase64) {
    if (b64Candidates.length > 0) {
      return b64Candidates.map((b64) => ({ b64_json: b64, revised_prompt: body.prompt }));
    }

    if (urlCandidates.length > 0) {
      const firstUrl = urlCandidates[0];
      const resp = await fetch(firstUrl, {
        signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS),
      });
      if (!resp.ok) {
        throw new Error(`Failed to fetch NanoBanana result image URL (${resp.status})`);
      }
      const arrayBuffer = await resp.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      return [{ b64_json: base64, revised_prompt: body.prompt }];
    }
  }

  if (urlCandidates.length > 0) {
    return urlCandidates.map((url) => ({ url, revised_prompt: body.prompt }));
  }

  if (b64Candidates.length > 0) {
    return b64Candidates.map((b64) => ({ b64_json: b64, revised_prompt: body.prompt }));
  }

  if (log) {
    log.warn(
      "IMAGE",
      `NanoBanana task completed without image payload: ${JSON.stringify(taskData).slice(0, 240)}`
    );
  }

  return [];
}

export function inferResolutionFromSize(size) {
  if (typeof size !== "string") return null;
  const [wRaw, hRaw] = size.split("x");
  const width = Number(wRaw);
  const height = Number(hRaw);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

  const longestSide = Math.max(width, height);
  if (longestSide <= 1024) return "1K";
  if (longestSide <= 2048) return "2K";
  return "4K";
}
