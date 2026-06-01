import { NextResponse } from "next/server";
import { resolveGetModelsContext } from "./get-models-handler-context";
import { handleAnthropicCompatibleModels } from "./handle-anthropic-compatible-models";
import { handleAntigravityModels } from "./handle-antigravity-models";
import { handleClaudeStaticModels } from "./handle-claude-static-models";
import { handleClineModels } from "./handle-cline-models";
import { handleCodexModels } from "./handle-codex-models";
import { handleConfiguredProviderModels } from "./handle-configured-provider-models";
import { handleDevinModels } from "./handle-devin-models";
import { handleGeminiCliModels } from "./handle-gemini-cli-models";
import { handleGithubModels } from "./handle-github-models";
import { handleGlmModels } from "./handle-glm-models";
import { handleKiroModels } from "./handle-kiro-models";
import { handleOpenAICompatibleModels } from "./handle-openai-compatible-models";
import { handleOpencodeGoModels } from "./handle-opencode-go-models";
import { handleQoderModels } from "./handle-qoder-models";
import { handleStaticRegistryModels } from "./handle-static-registry-models";
import { toModelsRouteError } from "./models-route-error";

export async function handleGetModels(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolved = await resolveGetModelsContext(request, context);
    if (resolved.kind === "response") return resolved.response;
    const ctx = resolved.context;

    return (
      (await handleOpencodeGoModels(ctx)) ??
      (await handleCodexModels(ctx)) ??
      (await handleOpenAICompatibleModels(ctx)) ??
      (await handleGithubModels(ctx)) ??
      (await handleClaudeStaticModels(ctx)) ??
      (await handleAntigravityModels(ctx)) ??
      (await handleGlmModels(ctx)) ??
      (await handleKiroModels(ctx)) ??
      (await handleGeminiCliModels(ctx)) ??
      (await handleClineModels(ctx)) ??
      (await handleDevinModels(ctx)) ??
      (await handleAnthropicCompatibleModels(ctx)) ??
      (await handleQoderModels(ctx)) ??
      (await handleStaticRegistryModels(ctx)) ??
      (await handleConfiguredProviderModels(ctx))
    );
  } catch (error) {
    const mapped = toModelsRouteError(error);
    console.log("Error fetching provider models:", error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
