import { getStaticQoderModels } from "@routiform/open-sse/services/qoderCli.ts";

const STATIC_MODEL_PROVIDERS: Record<string, () => Array<{ id: string; name: string }>> = {
  deepgram: () => [
    { id: "nova-3", name: "Nova 3 (Transcription)" },
    { id: "nova-2", name: "Nova 2 (Transcription)" },
    { id: "whisper-large", name: "Whisper Large (Transcription)" },
    { id: "aura-asteria-en", name: "Aura Asteria EN (TTS)" },
    { id: "aura-luna-en", name: "Aura Luna EN (TTS)" },
    { id: "aura-stella-en", name: "Aura Stella EN (TTS)" },
  ],
  assemblyai: () => [
    { id: "universal-3-pro", name: "Universal 3 Pro (Transcription)" },
    { id: "universal-2", name: "Universal 2 (Transcription)" },
  ],
  nanobanana: () => [
    { id: "nanobanana-flash", name: "NanoBanana Flash (Gemini 2.5 Flash)" },
    { id: "nanobanana-pro", name: "NanoBanana Pro (Gemini 3 Pro)" },
  ],
  antigravity: () => [
    { id: "claude-opus-4-6-thinking", name: "Claude Opus 4.6 (Thinking)" },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (Thinking)" },
    { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
    { id: "gemini-3-flash", name: "Gemini 3 Flash" },
    { id: "gemini-3.1-pro-high", name: "Gemini 3.1 Pro (High)" },
    { id: "gemini-3.1-pro-low", name: "Gemini 3.1 Pro (Low)" },
    { id: "gpt-oss-120b", name: "GPT-OSS-120b" },
  ],
  claude: () => [
    { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
    { id: "claude-opus-4-5-20251101", name: "Claude Opus 4.5 (2025-11-01)" },
    { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5 (2025-09-29)" },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5 (2025-10-01)" },
  ],
  perplexity: () => [
    { id: "sonar", name: "Sonar (Fast Search)" },
    { id: "sonar-pro", name: "Sonar Pro (Advanced Search)" },
    { id: "sonar-reasoning", name: "Sonar Reasoning (CoT + Search)" },
    { id: "sonar-reasoning-pro", name: "Sonar Reasoning Pro (Advanced CoT + Search)" },
    { id: "sonar-deep-research", name: "Sonar Deep Research (Expert Analysis)" },
  ],
  "bailian-coding-plan": () => [
    { id: "qwen3.5-plus", name: "Qwen3.5 Plus" },
    { id: "qwen3-max-2026-01-23", name: "Qwen3 Max (2026-01-23)" },
    { id: "qwen3-coder-next", name: "Qwen3 Coder Next" },
    { id: "qwen3-coder-plus", name: "Qwen3 Coder Plus" },
    { id: "MiniMax-M2.5", name: "MiniMax M2.5" },
    { id: "glm-5", name: "GLM 5" },
    { id: "glm-4.7", name: "GLM 4.7" },
    { id: "kimi-k2.5", name: "Kimi K2.5" },
  ],
  /** Curated Go-only list — not zen/v1 catalog (Zen has models Go cannot use). @see https://opencode.ai/docs/go/ */
  "opencode-go": () => [
    { id: "glm-5", name: "GLM-5" },
    { id: "kimi-k2.5", name: "Kimi K2.5" },
    { id: "mimo-v2-pro", name: "MiMo-V2-Pro" },
    { id: "mimo-v2-omni", name: "MiMo-V2-Omni" },
    { id: "minimax-m2.7", name: "MiniMax M2.7" },
    { id: "minimax-m2.5", name: "MiniMax M2.5" },
  ],
  qoder: () => getStaticQoderModels(),
};

/**
 * Get static models for a provider (if available).
 * Exported for testing purposes.
 * @param provider - Provider ID
 * @returns Array of models or undefined if provider doesn't use static models
 */
export function getStaticModelsForProvider(
  provider: string
): Array<{ id: string; name: string }> | undefined {
  const staticModelsFn = STATIC_MODEL_PROVIDERS[provider];
  return staticModelsFn ? staticModelsFn() : undefined;
}

export function getStaticModelProvidersRegistry(): Record<
  string,
  () => Array<{ id: string; name: string }>
> {
  return STATIC_MODEL_PROVIDERS;
}
