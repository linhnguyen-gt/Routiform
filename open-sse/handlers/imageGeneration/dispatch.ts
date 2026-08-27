import { handleGeminiImageGeneration } from "./providerGemini.ts";
import { handleOpenAIImageGeneration } from "./providerOpenai.ts";
import { handleHyperbolicImageGeneration } from "./providerHyperbolic.ts";
import { handleNanoBananaImageGeneration } from "./providerNanobanana.ts";
import { handleSDWebUIImageGeneration } from "./providerSdwebui.ts";
import { handleComfyUIImageGeneration } from "./providerComfyui.ts";
import { handleImagen3ImageGeneration } from "./providerImagen3.ts";
export async function dispatchImageGeneration({
  model,
  provider,
  providerConfig,
  body,
  credentials,
  log,
  callLog = true,
}) {
  if (providerConfig.format === "gemini-image") {
    return handleGeminiImageGeneration({ model, providerConfig, body, credentials, log, callLog });
  }

  if (providerConfig.format === "imagen3") {
    return handleImagen3ImageGeneration({
      model,
      provider,
      providerConfig,
      body,
      credentials,
      log,
      callLog,
    });
  }

  if (providerConfig.format === "hyperbolic") {
    return handleHyperbolicImageGeneration({
      model,
      provider,
      providerConfig,
      body,
      credentials,
      log,
      callLog,
    });
  }

  if (providerConfig.format === "nanobanana") {
    return handleNanoBananaImageGeneration({
      model,
      provider,
      providerConfig,
      body,
      credentials,
      log,
    });
  }

  if (providerConfig.format === "sdwebui") {
    return handleSDWebUIImageGeneration({ model, provider, providerConfig, body, log });
  }

  if (providerConfig.format === "comfyui") {
    return handleComfyUIImageGeneration({ model, provider, providerConfig, body, log });
  }

  return handleOpenAIImageGeneration({
    model,
    provider,
    providerConfig,
    body,
    credentials,
    log,
    callLog,
  });
}
