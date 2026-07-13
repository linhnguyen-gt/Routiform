import { register } from "../registry.ts";
import { FORMATS } from "../formats.ts";
import { DEFAULT_THINKING_GEMINI_SIGNATURE } from "../../config/defaultThinkingSignature.ts";
import { ANTIGRAVITY_DEFAULT_SYSTEM } from "../../config/constants.ts";
import { getGeminiThoughtSignature } from "../../services/geminiThoughtSignatureStore.ts";
import { fitGeminiThinkingBudget } from "../../services/thinkingBudget.ts";
import { openaiToClaudeRequestForAntigravity } from "./openai-to-claude.ts";
import {
  capMaxOutputTokens,
  capThinkingBudget,
  getDefaultThinkingBudget,
  getModelSpec,
} from "../../../src/shared/constants/modelSpecs.ts";

function generateUUID() {
  return crypto.randomUUID();
}

// HIGH 6 (fixed): `body.max_tokens` was the only field read for the client's
// requested output cap. OpenAI's CURRENT field is `max_completion_tokens`
// (`max_tokens` is deprecated on their side); for non-Responses targets
// (Gemini / Gemini CLI / Antigravity — this translator), nothing upstream of
// this file normalizes `max_completion_tokens` into `max_tokens` (that
// normalization only runs for the OPENAI_RESPONSES target), so a client that
// only sends `max_completion_tokens` had its cap silently ignored entirely,
// falling through to the model's default ceiling instead of the client's
// explicit, smaller request. `max_tokens` still wins if a client sends both
// (matches this proxy's existing preference elsewhere).
function resolveClientMaxTokens(body: Record<string, unknown>): number | undefined {
  if (typeof body?.max_tokens === "number" && Number.isFinite(body.max_tokens)) {
    return body.max_tokens as number;
  }
  if (
    typeof body?.max_completion_tokens === "number" &&
    Number.isFinite(body.max_completion_tokens)
  ) {
    return body.max_completion_tokens as number;
  }
  return undefined;
}

import {
  DEFAULT_SAFETY_SETTINGS,
  convertOpenAIContentToParts,
  extractTextContent,
  tryParseJSON,
  generateRequestId,
  generateSessionId,
  cleanJSONSchemaForAntigravity,
} from "../helpers/geminiHelper.ts";

type GeminiPart = Record<string, unknown>;
type GeminiContent = { role: string; parts: GeminiPart[] };

type GeminiGenerationConfig = {
  temperature?: unknown;
  topP?: unknown;
  topK?: unknown;
  maxOutputTokens?: unknown;
  thinkingConfig?: {
    thinkingBudget: number;
    includeThoughts: boolean;
  };
  responseMimeType?: string;
  responseSchema?: unknown;
};

type GeminiFunctionDeclaration = {
  name: string;
  description: string;
  parameters: unknown;
};

type GeminiRequest = {
  model: string;
  contents: GeminiContent[];
  generationConfig: GeminiGenerationConfig;
  safetySettings: unknown;
  systemInstruction?: GeminiContent;
  tools?: Array<{ functionDeclarations: GeminiFunctionDeclaration[] }>;
  cachedContent?: string;
};

type CloudCodeEnvelope = {
  project: string;
  model: string;
  user_prompt_id?: string;
  userAgent?: string;
  requestId?: string;
  requestType?: string;
  request: {
    session_id?: string;
    sessionId?: string;
    contents: GeminiContent[];
    systemInstruction?: GeminiContent;
    generationConfig: GeminiGenerationConfig;
    tools?: Array<{ functionDeclarations: GeminiFunctionDeclaration[] }>;
    safetySettings?: unknown;
    toolConfig?: {
      functionCallingConfig: { mode: string };
    };
  };
  _toolNameMap?: Map<string, string>;
};

// Merge consecutive same-role content entries and drop entries with no parts.
// Gemini rejects requests with adjacent same-role turns or zero-part entries
// with a 400 invalid_argument; neither shape is guaranteed to be avoided by
// the message-by-message conversion above (e.g. an assistant turn whose only
// content was an empty/omitted tool_calls array).
function normalizeGeminiContents(contents: GeminiContent[]): GeminiContent[] {
  const out: GeminiContent[] = [];
  for (const c of contents || []) {
    if (!c?.role || !Array.isArray(c.parts) || c.parts.length === 0) continue;
    const last = out[out.length - 1];
    if (last && last.role === c.role) {
      last.parts.push(...c.parts);
    } else {
      out.push({ ...c, parts: [...c.parts] });
    }
  }
  return out;
}

function normalizeAntigravityToolName(name: unknown): string {
  if (typeof name !== "string") return "";
  const trimmed = name.trim();
  if (!trimmed) return trimmed;

  const namespaceIndex = trimmed.indexOf(":");
  return namespaceIndex >= 0 ? trimmed.slice(namespaceIndex + 1) : trimmed;
}

// Core: Convert OpenAI request to Gemini format (base for all variants)
function openaiToGeminiBase(model, body, _stream) {
  const result: GeminiRequest = {
    model: model,
    contents: [],
    generationConfig: {},
    safetySettings: DEFAULT_SAFETY_SETTINGS,
  };

  // Preserve cachedContent if provided by client (for explicit Gemini caching)
  if (body.cachedContent) {
    result.cachedContent = body.cachedContent;
  }

  // Generation config
  if (body.temperature !== undefined) {
    result.generationConfig.temperature = body.temperature;
  }
  if (body.top_p !== undefined) {
    result.generationConfig.topP = body.top_p;
  }
  if (body.top_k !== undefined) {
    result.generationConfig.topK = body.top_k;
  }
  const clientMaxTokens = resolveClientMaxTokens(body);
  if (clientMaxTokens !== undefined) {
    result.generationConfig.maxOutputTokens = capMaxOutputTokens(model, clientMaxTokens);
  } else {
    result.generationConfig.maxOutputTokens = capMaxOutputTokens(model);
  }

  // Build tool_call_id -> name map
  const tcID2Name = {};
  if (body.messages && Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      if (msg.role === "assistant" && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          if (tc.type === "function" && tc.id && tc.function?.name) {
            tcID2Name[tc.id] = tc.function.name;
          }
        }
      }
    }
  }

  // Build tool responses cache
  const toolResponses = {};
  if (body.messages && Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      if (msg.role === "tool" && msg.tool_call_id) {
        toolResponses[msg.tool_call_id] = msg.content;
      }
    }
  }

  // Convert messages
  if (body.messages && Array.isArray(body.messages)) {
    for (let i = 0; i < body.messages.length; i++) {
      const msg = body.messages[i];
      const role = msg.role;
      const content = msg.content;

      if (role === "system" && body.messages.length > 1) {
        result.systemInstruction = {
          role: "user",
          parts: [{ text: typeof content === "string" ? content : extractTextContent(content) }],
        };
      } else if (role === "user" || (role === "system" && body.messages.length === 1)) {
        const parts = convertOpenAIContentToParts(content);
        if (parts.length > 0) {
          result.contents.push({ role: "user", parts });
        }
      } else if (role === "assistant") {
        const parts = [];

        // Thinking/reasoning → thought part with signature
        if (msg.reasoning_content) {
          parts.push({
            thought: true,
            text: msg.reasoning_content,
          });
          parts.push({
            thoughtSignature: DEFAULT_THINKING_GEMINI_SIGNATURE,
          });
        }

        if (content) {
          const text = typeof content === "string" ? content : extractTextContent(content);
          if (text) {
            parts.push({ text });
          }
        }

        if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
          const toolCallIds = [];
          const firstPersistedSignature = msg.tool_calls
            .map((tc) => getGeminiThoughtSignature(tc.id))
            .find((signature) => typeof signature === "string" && signature.length > 0);

          for (const tc of msg.tool_calls) {
            if (tc.type !== "function") continue;

            const args = tryParseJSON(tc.function?.arguments || "{}");
            const signatureForToolCall = getGeminiThoughtSignature(tc.id);
            const embeddedThoughtSignature =
              firstPersistedSignature || signatureForToolCall || DEFAULT_THINKING_GEMINI_SIGNATURE;

            parts.push({
              thoughtSignature: embeddedThoughtSignature,
              functionCall: {
                id: tc.id,
                name: tc.function.name,
                args: args,
              },
            });

            toolCallIds.push(tc.id);
          }

          if (parts.length > 0) {
            result.contents.push({ role: "model", parts });
          }

          // Check if there are actual tool responses in the next messages
          const hasActualResponses = toolCallIds.some((fid) => toolResponses[fid]);

          if (hasActualResponses) {
            const toolParts = [];
            for (const fid of toolCallIds) {
              if (!toolResponses[fid]) continue;

              let name = tcID2Name[fid];
              if (!name) {
                const idParts = fid.split("-");
                if (idParts.length > 2) {
                  name = idParts.slice(0, -2).join("-");
                } else {
                  name = fid;
                }
              }

              let resp = toolResponses[fid];
              let parsedResp = tryParseJSON(resp);
              if (parsedResp === null) {
                parsedResp = { result: resp };
              } else if (typeof parsedResp !== "object") {
                parsedResp = { result: parsedResp };
              }

              toolParts.push({
                functionResponse: {
                  id: fid,
                  name: name,
                  response: { result: parsedResp },
                },
              });
            }
            if (toolParts.length > 0) {
              result.contents.push({ role: "user", parts: toolParts });
            }
          }
        } else if (parts.length > 0) {
          result.contents.push({ role: "model", parts });
        }
      }
    }
  }

  // Convert tools
  if (body.tools && Array.isArray(body.tools) && body.tools.length > 0) {
    const functionDeclarations = [];
    for (const t of body.tools) {
      // Check if already in Anthropic/Claude format (no type field, direct name/description/input_schema)
      if (t.name && t.input_schema) {
        functionDeclarations.push({
          name: t.name,
          description: t.description || "",
          parameters: cleanJSONSchemaForAntigravity(
            t.input_schema || { type: "object", properties: {} }
          ),
        });
      }
      // OpenAI format
      else if (t.type === "function" && t.function) {
        const fn = t.function;
        functionDeclarations.push({
          name: fn.name,
          description: fn.description || "",
          parameters: cleanJSONSchemaForAntigravity(
            fn.parameters || { type: "object", properties: {} }
          ),
        });
      }
    }

    if (functionDeclarations.length > 0) {
      result.tools = [{ functionDeclarations }];
    }
  }

  // Convert response_format to Gemini's responseMimeType/responseSchema
  if (body.response_format) {
    if (body.response_format.type === "json_schema" && body.response_format.json_schema) {
      result.generationConfig.responseMimeType = "application/json";
      // Extract the schema (may be nested under .schema key)
      const schema = body.response_format.json_schema.schema || body.response_format.json_schema;
      if (schema && typeof schema === "object") {
        result.generationConfig.responseSchema = cleanJSONSchemaForAntigravity(schema);
      }
    } else if (body.response_format.type === "json_object") {
      result.generationConfig.responseMimeType = "application/json";
    } else if (body.response_format.type === "text") {
      result.generationConfig.responseMimeType = "text/plain";
    }
  }

  result.contents = normalizeGeminiContents(result.contents);
  return result;
}

// OpenAI -> Gemini (standard API)
export function openaiToGeminiRequest(model, body, stream) {
  return openaiToGeminiBase(model, body, stream);
}

// OpenAI -> Gemini CLI (Cloud Code Assist)
export function openaiToGeminiCLIRequest(model, body, stream) {
  const gemini = openaiToGeminiBase(model, body, stream);
  const _isClaude = model.toLowerCase().includes("claude");

  // Add thinking config for CLI.
  // Only models with an explicit `supportsThinking: true` MODEL_SPECS entry
  // get a thinkingConfig. This is a deliberate opt-in (not opt-out): a model
  // with no MODEL_SPECS entry at all (e.g. an arbitrary id surfaced by
  // Antigravity's live model list) has no verified thinkingBudget range or
  // output cap, so we cannot safely vouch for what budget/maxOutputTokens
  // combination is valid for it. Every currently-registered Gemini model
  // already declares supportsThinking explicitly (true or false), so this
  // only changes behavior for genuinely unregistered ids — they now degrade
  // safely (no thinkingConfig, capped maxOutputTokens) instead of risking an
  // invalid request built on unknown limits.
  const modelSupportsThinking = getModelSpec(model)?.supportsThinking === true;

  if (body.reasoning_effort && modelSupportsThinking) {
    const budgetMap: Record<string, number> = {
      low: 1024,
      medium: getDefaultThinkingBudget(model) || 8192,
      high: capThinkingBudget(model, 32768),
    };
    // Look up by key presence, not `budgetMap[effort] || fallback` — a
    // legitimate 0 budget (e.g. a capped-to-0 tier) is falsy and would
    // otherwise fall through to the 8192 literal, resending thinking to a
    // model/tier that should have none.
    const budget = Object.prototype.hasOwnProperty.call(budgetMap, body.reasoning_effort)
      ? budgetMap[body.reasoning_effort]
      : getDefaultThinkingBudget(model) || 8192;
    // Reconcile maxOutputTokens/thinkingBudget so thinking doesn't starve the
    // visible answer (empty content on small max_tokens + high effort),
    // without ever raising a max_tokens cap the client set explicitly —
    // that cap is authoritative for cost control; shrink the thinking
    // budget to fit it instead (see fitGeminiThinkingBudget). The RAW,
    // unclamped client max_tokens (max_tokens or max_completion_tokens) is
    // passed through (not the already-capped gemini.generationConfig
    // .maxOutputTokens) so the function can tell "client asked for 8192"
    // apart from "client asked for nothing and we defaulted to 8192".
    // `reasoning_effort` only ever reaches this branch when the client (or
    // an earlier normalization step operating on an already-client-set
    // field) put it there — never purely injected from nothing — so this is
    // always a genuine client request (default `clientRequestedThinking`).
    const fit = fitGeminiThinkingBudget(model, resolveClientMaxTokens(body), budget);
    gemini.generationConfig.maxOutputTokens = fit.maxOutputTokens;
    if (fit.omitThinkingConfig) {
      delete gemini.generationConfig.thinkingConfig;
    } else {
      gemini.generationConfig.thinkingConfig = {
        thinkingBudget: fit.thinkingBudgetTokens,
        includeThoughts: fit.thinkingBudgetTokens > 0,
      };
    }
  }

  // Thinking config from Claude format. body.thinking.budget_tokens is a
  // RAW, client-supplied value with no upper bound of its own (e.g. a
  // Claude-format client can send `budget_tokens: 200000`); it is passed
  // through unclamped here, not because it's unbounded, but because
  // `fitGeminiThinkingBudget` itself applies `capThinkingBudget` internally
  // before any headroom fitting, so every caller (this one and the
  // reasoning_effort branch above) gets the same model-declared
  // thinkingBudgetCap enforced in one place.
  //
  // Unlike the reasoning_effort branch above, `body.thinking` CAN be purely
  // proxy-injected: thinkingBudget.ts's CUSTOM/ADAPTIVE mode sets
  // `body.thinking` on ANY thinking-capable-model request via
  // `hasThinkingCapableModel` (model-name matching alone), even when the
  // original client asked for nothing at all (CRITICAL 2). It tags that
  // with `__thinkingClientRequested: false`; absence of the tag (e.g. plain
  // PASSTHROUGH mode, or a genuine Claude-format client) defaults to true —
  // the safe, "try to honor it" behavior for an actual client ask.
  if (body.thinking?.type === "enabled" && body.thinking.budget_tokens && modelSupportsThinking) {
    const clientRequestedThinking = body.__thinkingClientRequested !== false;
    const fit = fitGeminiThinkingBudget(
      model,
      resolveClientMaxTokens(body),
      body.thinking.budget_tokens,
      clientRequestedThinking
    );
    gemini.generationConfig.maxOutputTokens = fit.maxOutputTokens;
    if (fit.omitThinkingConfig) {
      delete gemini.generationConfig.thinkingConfig;
    } else {
      gemini.generationConfig.thinkingConfig = {
        thinkingBudget: fit.thinkingBudgetTokens,
        includeThoughts: fit.thinkingBudgetTokens > 0,
      };
    }
  }

  // Clean schema for tools
  if (gemini.tools?.[0]?.functionDeclarations) {
    for (const fn of gemini.tools[0].functionDeclarations) {
      fn.name = normalizeAntigravityToolName(fn.name);
      if (fn.parameters) {
        const cleanedSchema = cleanJSONSchemaForAntigravity(fn.parameters);
        fn.parameters = cleanedSchema;
        // if (isClaude) {
        //   fn.parameters = cleanedSchema;
        // } else {
        //   fn.parametersJsonSchema = cleanedSchema;
        //   delete fn.parameters;
        // }
      }
    }
  }

  if (Array.isArray(gemini.contents)) {
    for (const content of gemini.contents) {
      if (!Array.isArray(content.parts)) continue;
      for (const part of content.parts) {
        const functionCall =
          part.functionCall &&
          typeof part.functionCall === "object" &&
          !Array.isArray(part.functionCall)
            ? (part.functionCall as Record<string, unknown>)
            : null;
        if (functionCall && "name" in functionCall) {
          functionCall.name = normalizeAntigravityToolName(String(functionCall.name ?? ""));
        }

        const functionResponse =
          part.functionResponse &&
          typeof part.functionResponse === "object" &&
          !Array.isArray(part.functionResponse)
            ? (part.functionResponse as Record<string, unknown>)
            : null;
        if (functionResponse && "name" in functionResponse) {
          functionResponse.name = normalizeAntigravityToolName(String(functionResponse.name ?? ""));
        }
      }
    }
  }

  return gemini;
}

// Wrap Gemini CLI format in Cloud Code wrapper
function wrapInCloudCodeEnvelope(model, geminiCLI, credentials = null, isAntigravity = false) {
  // Both Antigravity and Gemini CLI need the project field for the Cloud Code API.
  // For Gemini CLI, the stored projectId may be stale; the executor's transformRequest
  // refreshes it via loadCodeAssist before the request is sent to the API.
  let projectId = credentials?.projectId;

  if (!projectId) {
    console.warn(
      `[Routiform] ${isAntigravity ? "Antigravity" : "GeminiCLI"} account is missing projectId. ` +
        `Attempting request with empty project — reconnect OAuth to resolve.`
    );
    projectId = "";
  }

  const cleanModel = model.includes("/") ? model.split("/").pop()! : model;

  const envelope: CloudCodeEnvelope = isAntigravity
    ? {
        project: projectId,
        model: cleanModel,
        userAgent: "antigravity",
        requestType: "agent",
        requestId: `agent-${generateUUID()}`,
        request: {
          sessionId: generateSessionId(),
          contents: geminiCLI.contents,
          systemInstruction: geminiCLI.systemInstruction,
          generationConfig: geminiCLI.generationConfig,
          tools: geminiCLI.tools,
        },
      }
    : {
        model: cleanModel,
        project: projectId,
        user_prompt_id: generateRequestId(),
        request: {
          contents: geminiCLI.contents,
          systemInstruction: geminiCLI.systemInstruction,
          generationConfig: geminiCLI.generationConfig,
          tools: geminiCLI.tools,
        },
      };
  if (geminiCLI._toolNameMap instanceof Map && geminiCLI._toolNameMap.size > 0) {
    envelope._toolNameMap = geminiCLI._toolNameMap;
  }

  // Antigravity specific fields
  if (isAntigravity) {
    // Inject required default system prompt for Antigravity
    const defaultPart: GeminiPart = { text: ANTIGRAVITY_DEFAULT_SYSTEM };
    if (envelope.request.systemInstruction?.parts) {
      envelope.request.systemInstruction.parts.unshift(defaultPart);
    } else {
      envelope.request.systemInstruction = { role: "user", parts: [defaultPart] };
    }
  } else {
    // Gemini CLI's native Cloud Code envelope uses snake_case identifiers.
    envelope.request.session_id = generateSessionId();
    envelope.request.safetySettings = geminiCLI.safetySettings;
  }

  // toolConfig applies to any tool-bearing request, not just Antigravity —
  // previously this was set only inside the isAntigravity branch, so plain
  // gemini-cli requests with tools never got VALIDATED function calling mode.
  if (geminiCLI.tools?.length > 0) {
    envelope.request.toolConfig = {
      functionCallingConfig: { mode: "VALIDATED" },
    };
  }

  return envelope;
}

function wrapInCloudCodeEnvelopeForClaude(model, claudeRequest, credentials = null) {
  let projectId = credentials?.projectId;

  if (!projectId) {
    console.warn(
      `[Routiform] Antigravity/Claude account is missing projectId. ` +
        `Attempting request with empty project — reconnect OAuth to resolve.`
    );
    projectId = "";
  }

  const cleanModel = model.includes("/") ? model.split("/").pop()! : model;

  const envelope: CloudCodeEnvelope = {
    project: projectId,
    model: cleanModel,
    userAgent: "antigravity",
    requestId: `agent-${generateUUID()}`,
    requestType: "agent",
    request: {
      sessionId: generateSessionId(),
      contents: [],
      generationConfig: {
        temperature: claudeRequest.temperature || 1,
        maxOutputTokens: claudeRequest.max_tokens || 4096,
      },
    },
  };

  // Convert Claude messages to Gemini contents
  if (claudeRequest.messages && Array.isArray(claudeRequest.messages)) {
    for (const msg of claudeRequest.messages) {
      const parts = [];

      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "text") {
            parts.push({ text: block.text });
          } else if (block.type === "image" && block.source) {
            parts.push({
              inlineData: {
                mimeType: block.source.media_type,
                data: block.source.data,
              },
            });
          } else if (block.type === "tool_use") {
            parts.push({
              functionCall: {
                id: block.id,
                name: block.name,
                args: block.input || {},
              },
            });
          } else if (block.type === "tool_result") {
            let content = block.content;
            if (Array.isArray(content)) {
              content = content
                .map((c) => (c.type === "text" ? c.text : JSON.stringify(c)))
                .join("\n");
            }
            parts.push({
              functionResponse: {
                id: block.tool_use_id,
                name: "unknown",
                response: { result: tryParseJSON(content) || content },
              },
            });
          }
        }
      } else if (typeof msg.content === "string") {
        parts.push({ text: msg.content });
      }

      if (parts.length > 0) {
        const role = msg.role === "assistant" ? "model" : "user";
        if (role === "model") {
          for (const p of parts) {
            if (p.functionCall && !p.thoughtSignature) {
              p.thoughtSignature = DEFAULT_THINKING_GEMINI_SIGNATURE;
            }
          }
        }
        envelope.request.contents.push({
          role,
          parts,
        });
      }
    }
  }

  // Convert Claude tools to Gemini functionDeclarations
  if (claudeRequest.tools && Array.isArray(claudeRequest.tools)) {
    const functionDeclarations = [];
    for (const tool of claudeRequest.tools) {
      if (tool.name && tool.input_schema) {
        const cleanedSchema = cleanJSONSchemaForAntigravity(tool.input_schema);
        functionDeclarations.push({
          name: tool.name,
          description: tool.description || "",
          parameters: cleanedSchema,
        });
      }
    }
    if (functionDeclarations.length > 0) {
      envelope.request.tools = [{ functionDeclarations }];
      envelope.request.toolConfig = {
        functionCallingConfig: { mode: "VALIDATED" },
      };
    }
  }

  // Add system instruction (Antigravity default)
  const defaultPart = { text: ANTIGRAVITY_DEFAULT_SYSTEM };
  const systemParts = [defaultPart];

  if (claudeRequest.system) {
    if (Array.isArray(claudeRequest.system)) {
      for (const block of claudeRequest.system) {
        if (block.text) systemParts.push({ text: block.text });
      }
    } else if (typeof claudeRequest.system === "string") {
      systemParts.push({ text: claudeRequest.system });
    }
  }

  envelope.request.systemInstruction = { role: "user", parts: systemParts };

  envelope.request.contents = normalizeGeminiContents(envelope.request.contents);
  return envelope;
}

// OpenAI -> Antigravity (Sandbox Cloud Code with wrapper)
export function openaiToAntigravityRequest(model, body, stream, credentials = null) {
  const isClaude = model.toLowerCase().includes("claude");

  if (isClaude) {
    const claudeRequest = openaiToClaudeRequestForAntigravity(model, body, stream);
    return wrapInCloudCodeEnvelopeForClaude(model, claudeRequest, credentials);
  }

  const geminiCLI = openaiToGeminiCLIRequest(model, body, stream);
  return wrapInCloudCodeEnvelope(model, geminiCLI, credentials, true);
}

// Register
register(FORMATS.OPENAI, FORMATS.GEMINI, openaiToGeminiRequest, null);
register(
  FORMATS.OPENAI,
  FORMATS.GEMINI_CLI,
  (model, body, stream, credentials) =>
    wrapInCloudCodeEnvelope(model, openaiToGeminiCLIRequest(model, body, stream), credentials),
  null
);
register(FORMATS.OPENAI, FORMATS.ANTIGRAVITY, openaiToAntigravityRequest, null);
