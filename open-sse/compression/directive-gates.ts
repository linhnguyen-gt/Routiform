/**
 * When a system-prompt directive may be injected at all.
 *
 * Shared by every directive that goes through `appendSystemDirective`, because the answer does not
 * depend on which directive it is: these gates are about what the *request* is asking the model to
 * produce. A second copy of them would drift from this one.
 *
 * @module compression/directive-gates
 */

/**
 * True when `tool_choice` forces the model into a tool call rather than
 * prose (a specific/named tool, or a string like `"required"`). A
 * terseness/prose directive is meaningless (and risks bleeding into
 * generated tool-call arguments) for these.
 *
 * Deliberately an allow-list, not "any object is forced": both the inbound
 * OpenAI shape (`"auto"` / `"none"` / `"required"` / `{type:"function",
 * function:{name}}`) and the Claude-translated shape (`{type:"auto"}` /
 * `{type:"any"}` / `{type:"tool", name}`, see `convertOpenAIToolChoice` in
 * `translator/request/openai-to-claude.ts`) must classify correctly — an
 * "any object = forced" check wrongly treats `{type:"auto"}` as forced,
 * silently killing the directive for the majority of agentic clients
 * (Cline/OpenCode/Cursor/aider/LiteLLM all send `tool_choice: "auto"`,
 * which translation turns into the object `{type:"auto"}`).
 */
function isForcedToolChoice(toolChoice: unknown): boolean {
  if (toolChoice == null) return false;
  if (typeof toolChoice === "string") return toolChoice === "required";
  if (typeof toolChoice !== "object") return false;
  const type = (toolChoice as Record<string, unknown>).type;
  return type === "tool" || type === "function" || type === "any";
}

/**
 * True when a Gemini-shaped inbound body forces a function call via
 * `toolConfig.functionCallingConfig.mode: "ANY"` — the Gemini equivalent of
 * OpenAI `tool_choice: "required"` / Claude `{type:"any"}`. `"NONE"` forbids
 * tool calls (pure prose — directive is safe) and `"AUTO"` is the default
 * (model decides — directive is safe), so only `"ANY"` gates.
 *
 * Field shape verified against the outbound translator, which builds this
 * exact structure: `open-sse/translator/request/openai-to-gemini.ts:99-101`
 * (type decl `toolConfig?: { functionCallingConfig: { mode: string } }`) and
 * `:564-565`/`:677-678` (`envelope.request.toolConfig = { functionCallingConfig:
 * { mode: "VALIDATED" } }`). Reaches the compression gate unmodified because
 * `detectFormat`/`detectFormatFromEndpoint` (open-sse/services/provider.ts:93)
 * detects a Gemini body by `Array.isArray(body.contents)` and does not
 * pre-convert it before this stage runs.
 */
function isGeminiForcedFunctionCalling(gate: Record<string, unknown> | null | undefined): boolean {
  if (!gate) return false;
  const toolConfig = gate.toolConfig;
  if (!toolConfig || typeof toolConfig !== "object") return false;
  const functionCallingConfig = (toolConfig as Record<string, unknown>).functionCallingConfig;
  if (!functionCallingConfig || typeof functionCallingConfig !== "object") return false;
  return (functionCallingConfig as Record<string, unknown>).mode === "ANY";
}

/**
 * True when the request demands machine-parseable structured output
 * (OpenAI `response_format: {type: "json_schema"|"json_object"}` or the
 * Responses API `text.format: {type: "json_schema"}`). Prose directives like
 * "Fragments OK, drop articles" can corrupt schema-conformant JSON, so these
 * requests must never get the directive.
 */
function requiresStructuredOutput(body: Record<string, unknown> | null | undefined): boolean {
  if (!body) return false;
  const responseFormat = body.response_format;
  if (responseFormat && typeof responseFormat === "object") {
    const type = (responseFormat as Record<string, unknown>).type;
    if (type === "json_schema" || type === "json_object") return true;
  }
  const text = body.text;
  if (text && typeof text === "object") {
    const format = (text as Record<string, unknown>).format;
    if (
      format &&
      typeof format === "object" &&
      (format as Record<string, unknown>).type === "json_schema"
    ) {
      return true;
    }
  }
  // Gemini structured output: `generationConfig.responseSchema` (schema
  // present) or `generationConfig.responseMimeType: "application/json"`.
  // Field shape verified against the outbound translator, which sets both
  // from an inbound OpenAI response_format:
  // open-sse/translator/request/openai-to-gemini.ts:334-348
  // (`result.generationConfig.responseMimeType = "application/json"` and
  // `result.generationConfig.responseSchema = ...`). A Gemini-shaped inbound
  // body carries these two fields under the same `generationConfig` key.
  const generationConfig = body.generationConfig;
  if (generationConfig && typeof generationConfig === "object") {
    const gc = generationConfig as Record<string, unknown>;
    if (gc.responseSchema || gc.responseMimeType === "application/json") return true;
  }
  return false;
}

/**
 * True when the request tolerates a prose directive in its system prompt.
 *
 * `gate` is the body the gates inspect, which is not always the body being written to: the caller
 * may pass a pre-translation body when the one it is mutating has already had `tool_choice` or
 * `response_format` reshaped by format translation.
 */
export function canInjectSystemDirective(
  gate: Record<string, unknown> | null | undefined
): boolean {
  if (isForcedToolChoice(gate?.tool_choice)) return false;
  if (isGeminiForcedFunctionCalling(gate)) return false;
  if (requiresStructuredOutput(gate)) return false;
  return true;
}
