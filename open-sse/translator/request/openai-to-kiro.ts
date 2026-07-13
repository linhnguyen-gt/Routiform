/**
 * OpenAI to Kiro Request Translator
 * Converts OpenAI Chat Completions format to Kiro/AWS CodeWhisperer format
 */
import { v4 as uuidv4 } from "uuid";

import { FORMATS } from "../formats.ts";
import { register } from "../registry.ts";

type JsonRecord = Record<string, unknown>;

type OpenAIContentPart = JsonRecord & {
  type?: string;
  text?: string;
  image_url?: { url?: string };
  source?: { type?: string; media_type?: string; data?: string };
  content?: string | OpenAIContentPart[];
  tool_use_id?: string;
};

type OpenAIToolCall = {
  id?: string;
  function?: { name?: string; arguments?: string | JsonRecord };
  name?: string;
  input?: JsonRecord;
};

type OpenAIMessage = {
  role?: string;
  content?: string | OpenAIContentPart[] | null;
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
};

type OpenAITool = {
  name?: string;
  description?: string;
  parameters?: JsonRecord;
  input_schema?: JsonRecord;
  function?: {
    name?: string;
    description?: string;
    parameters?: JsonRecord;
  };
};

type KiroImage = { format: string; source: { bytes: string } };
type KiroToolResultContentBlock = { text: string } | { json: JsonRecord };
type KiroToolResult = {
  toolUseId: string | undefined;
  status: "success" | "error";
  content: KiroToolResultContentBlock[];
};
type KiroToolUse = {
  toolUseId: string;
  name: string | undefined;
  input: JsonRecord;
};
type KiroToolSpecification = {
  toolSpecification: {
    name: string | undefined;
    description: string;
    inputSchema: { json: JsonRecord };
  };
};
type KiroUserInputMessageContext = {
  tools?: KiroToolSpecification[];
  toolResults?: KiroToolResult[];
};
type KiroUserInputMessage = {
  content: string;
  modelId: string;
  origin?: string;
  userIntent?: string;
  images?: KiroImage[];
  userInputMessageContext?: KiroUserInputMessageContext;
  additionalModelRequestFields?: Record<string, unknown>;
};
type KiroAssistantResponseMessage = {
  content: string;
  messageId?: string;
  toolUses?: KiroToolUse[];
};
type KiroHistoryItem = {
  userInputMessage?: KiroUserInputMessage;
  assistantResponseMessage?: KiroAssistantResponseMessage;
};
type KiroPayload = {
  conversationState: {
    chatTriggerType: "MANUAL";
    conversationId: string;
    currentMessage: { userInputMessage: KiroUserInputMessage & { origin: "AI_EDITOR" } };
    history: KiroHistoryItem[];
    workspaceId?: string;
    customizationArn?: string;
  };
  profileArn?: string;
  inferenceConfig?: {
    maxTokens?: number;
    temperature?: unknown;
    topP?: unknown;
  };
};
type KiroCredentials = { providerSpecificData?: { profileArn?: string } } & JsonRecord;

/**
 * Convert OpenAI messages to Kiro format
 * Rules: system/tool/user -> user role, merge consecutive same roles
 */
function parseToolArguments(value: string | JsonRecord | undefined): JsonRecord {
  if (typeof value !== "string") return value ?? {};
  return JSON.parse(value) as JsonRecord;
}

function convertMessages(messages: OpenAIMessage[], tools: OpenAITool[], model: string) {
  const history: KiroHistoryItem[] = [];
  let currentMessage: KiroHistoryItem | null = null;

  let pendingUserContent: string[] = [];
  let pendingAssistantContent: string[] = [];
  let pendingToolResults: KiroToolResult[] = [];
  let pendingImages: KiroImage[] = [];
  let currentRole: string | null = null;

  // Extract system messages first — Kiro has no dedicated system field. The combined
  // system text is sent exactly once, prepended as an <instructions> block to the
  // current message content (see buildKiroPayload). It is deliberately NOT also set on
  // userInputMessage.systemInstruction for the OpenAI->Kiro path: content is guaranteed
  // to be read by the model, whereas a schema field the backend may silently ignore is
  // not worth doubling the system-prompt token cost on every request against a quota-metered
  // provider.
  const systemParts: string[] = [];
  const nonSystemMessages: OpenAIMessage[] = [];
  for (const msg of messages) {
    if (msg.role === "system") {
      const text =
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .map((c) => (typeof c.text === "string" ? c.text : ""))
                .filter(Boolean)
                .join("\n")
            : "";
      if (text) systemParts.push(text);
    } else {
      nonSystemMessages.push(msg);
    }
  }
  const systemPrompt = systemParts.join("\n\n");

  // Image support is pre-filtered by caps in translateRequest before reaching here
  const supportsImages = true;

  const flushPending = () => {
    if (currentRole === "user") {
      const content = pendingUserContent.join("\n\n").trim() || "continue";
      const userInputMessage: KiroUserInputMessage = {
        content: content,
        modelId: "",
      };

      // Attach images if present (Kiro API supports images field)
      if (pendingImages.length > 0) {
        userInputMessage.images = pendingImages;
      }

      if (pendingToolResults.length > 0) {
        userInputMessage.userInputMessageContext = {
          toolResults: pendingToolResults,
        };
      }

      // Add tools to first user message
      if (tools && tools.length > 0 && history.length === 0) {
        if (!userInputMessage.userInputMessageContext) {
          userInputMessage.userInputMessageContext = {};
        }
        userInputMessage.userInputMessageContext.tools = tools.map((t) => {
          const name = t.function?.name || t.name;
          let description = t.function?.description || t.description || "";

          if (!description.trim()) {
            description = `Tool: ${name}`;
          }

          const schema = t.function?.parameters || t.parameters || t.input_schema || {};
          // Normalize schema: Kiro requires required[] and proper type/properties
          const normalizedSchema =
            Object.keys(schema).length === 0
              ? { type: "object", properties: {}, required: [] }
              : { ...schema, required: schema.required ?? [] };

          return {
            toolSpecification: {
              name,
              description,
              inputSchema: { json: normalizedSchema },
            },
          };
        });
      }

      const userMsg: KiroHistoryItem = { userInputMessage };

      history.push(userMsg);
      currentMessage = userMsg;
      pendingUserContent = [];
      pendingToolResults = [];
      pendingImages = [];
    } else if (currentRole === "assistant") {
      const content = pendingAssistantContent.join("\n\n").trim() || "...";
      const assistantMsg: KiroHistoryItem = {
        assistantResponseMessage: {
          content: content,
        },
      };
      history.push(assistantMsg);
      pendingAssistantContent = [];
    }
  };

  for (let i = 0; i < nonSystemMessages.length; i++) {
    const msg = nonSystemMessages[i];
    let role = msg.role || "user";

    // Normalize: tool -> user (system already extracted above)
    if (role === "tool") {
      role = "user";
    }

    // If role changes, flush pending
    if (role !== currentRole && currentRole !== null) {
      flushPending();
    }
    currentRole = role;

    if (role === "user") {
      // Extract content
      let content = "";
      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        const textParts = [];
        for (const c of msg.content) {
          if (c.type === "text" || c.text) {
            textParts.push(c.text || "");
          } else if (supportsImages && c.type === "image_url") {
            // OpenAI format: image_url.url with data URI
            const url = c.image_url?.url || "";
            const base64Match = url.match(/^data:([^;]+);base64,(.+)$/);
            if (base64Match) {
              const mediaType = base64Match[1];
              const format = mediaType.split("/")[1] || mediaType;
              pendingImages.push({ format, source: { bytes: base64Match[2] } });
            } else if (url.startsWith("http://") || url.startsWith("https://")) {
              // Kiro only supports base64 — fallback to URL text
              textParts.push(`[Image: ${url}]`);
            }
          } else if (supportsImages && c.type === "image") {
            // Claude format: source.type = "base64", source.media_type, source.data
            if (c.source?.type === "base64" && c.source?.data) {
              const mediaType = c.source.media_type || "image/png";
              const format = mediaType.split("/")[1] || mediaType;
              pendingImages.push({ format, source: { bytes: c.source.data } });
            }
          }
        }
        content = textParts.join("\n");

        // Check for tool_result blocks
        const toolResultBlocks = msg.content.filter((c) => c.type === "tool_result");
        if (toolResultBlocks.length > 0) {
          toolResultBlocks.forEach((block) => {
            const contentBlocks: KiroToolResultContentBlock[] = Array.isArray(block.content)
              ? block.content.map((c) =>
                  c.type === "json" && c.json != null
                    ? { json: c.json as JsonRecord }
                    : { text: c.text || "" }
                )
              : [{ text: typeof block.content === "string" ? block.content : "" }];

            pendingToolResults.push({
              toolUseId: block.tool_use_id,
              status: "success",
              content: contentBlocks,
            });
          });
        }
      }

      // Handle tool role (from normalized)
      if (msg.role === "tool") {
        const toolContent = typeof msg.content === "string" ? msg.content : "";
        pendingToolResults.push({
          toolUseId: msg.tool_call_id,
          status: "success",
          content: [{ text: toolContent }],
        });
      } else if (content) {
        pendingUserContent.push(content);
      }
    } else if (role === "assistant") {
      // Extract text content and tool uses
      let textContent = "";
      let toolUses: OpenAIToolCall[] = [];

      if (Array.isArray(msg.content)) {
        const textBlocks = msg.content.filter((c) => c.type === "text");
        textContent = textBlocks
          .map((b) => b.text)
          .join("\n")
          .trim();

        const toolUseBlocks = msg.content.filter((c) => c.type === "tool_use") as OpenAIToolCall[];
        toolUses = toolUseBlocks;
      } else if (typeof msg.content === "string") {
        textContent = msg.content.trim();
      }

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        toolUses = msg.tool_calls;
      }

      if (textContent) {
        pendingAssistantContent.push(textContent);
      }

      // Store tool uses in last assistant message
      if (toolUses.length > 0) {
        if (pendingAssistantContent.length === 0) {
          // pendingAssistantContent.push("Call tools");
        }

        // Flush to create assistant message with toolUses
        flushPending();

        const lastMsg = history[history.length - 1];
        if (lastMsg?.assistantResponseMessage) {
          lastMsg.assistantResponseMessage.toolUses = toolUses.map((tc) => {
            if (tc.function) {
              return {
                toolUseId: tc.id || uuidv4(),
                name: tc.function.name,
                input:
                  typeof tc.function.arguments === "string"
                    ? parseToolArguments(tc.function.arguments)
                    : tc.function.arguments || {},
              };
            } else {
              return {
                toolUseId: tc.id || uuidv4(),
                name: tc.name,
                input: tc.input || {},
              };
            }
          });
        }

        currentRole = null;
      }
    }
  }

  // Flush remaining
  if (currentRole !== null) {
    flushPending();
  }

  // Pop last userInputMessage as currentMessage (search from end, skip trailing assistant messages)
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].userInputMessage) {
      currentMessage = history.splice(i, 1)[0];
      break;
    }
  }

  // Grab tools from first history item BEFORE cleanup removes them
  const firstHistoryTools = history[0]?.userInputMessage?.userInputMessageContext?.tools;

  // Clean up history for Kiro API compatibility
  history.forEach((item) => {
    if (item.userInputMessage?.userInputMessageContext?.tools) {
      delete item.userInputMessage.userInputMessageContext.tools;
    }
    if (
      item.userInputMessage?.userInputMessageContext &&
      Object.keys(item.userInputMessage.userInputMessageContext).length === 0
    ) {
      delete item.userInputMessage.userInputMessageContext;
    }
    if (item.userInputMessage && !item.userInputMessage.modelId) {
      item.userInputMessage.modelId = model;
    }
    if (item.userInputMessage && !item.userInputMessage.origin) {
      item.userInputMessage.origin = "AI_EDITOR";
    }
  });

  // Merge consecutive user messages (Kiro requires alternating user/assistant)
  const mergedHistory: KiroHistoryItem[] = [];
  for (let i = 0; i < history.length; i++) {
    const current = history[i];
    if (
      current.userInputMessage &&
      mergedHistory.length > 0 &&
      mergedHistory[mergedHistory.length - 1].userInputMessage
    ) {
      const prevUserInputMessage = mergedHistory[mergedHistory.length - 1].userInputMessage;
      if (prevUserInputMessage) {
        prevUserInputMessage.content += "\n\n" + current.userInputMessage.content;
      }
    } else {
      mergedHistory.push(current);
    }
  }

  // Inject tools into currentMessage AFTER cleanup
  if (
    firstHistoryTools &&
    currentMessage?.userInputMessage &&
    !currentMessage.userInputMessage.userInputMessageContext?.tools
  ) {
    if (!currentMessage.userInputMessage.userInputMessageContext) {
      currentMessage.userInputMessage.userInputMessageContext = {};
    }
    currentMessage.userInputMessage.userInputMessageContext.tools = firstHistoryTools;
  }

  return { history: mergedHistory, currentMessage, systemPrompt };
}

/**
 * Build Kiro payload from OpenAI format
 */
export function buildKiroPayload(
  model: string,
  body: Record<string, unknown>,
  stream?: boolean,
  credentials?: KiroCredentials | null
): KiroPayload {
  void stream;
  const messages = Array.isArray(body.messages) ? (body.messages as OpenAIMessage[]) : [];
  const tools = Array.isArray(body.tools) ? (body.tools as OpenAITool[]) : [];
  const maxTokens = 32000;
  const temperature = body.temperature;
  const topP = body.top_p;

  // Detect if thinking should be enabled.
  // Kiro Claude models (4.6+) support thinking via additionalModelRequestFields.
  // Enable adaptive thinking when client sends reasoning_effort or thinking config,
  // or when model name suggests thinking capability.
  const hasReasoningEffort =
    typeof body.reasoning_effort === "string" && body.reasoning_effort !== "none";
  const hasThinkingConfig =
    body.thinking &&
    typeof body.thinking === "object" &&
    (body.thinking as Record<string, unknown>).type !== "disabled";
  const isThinkingCapableModel = /^claude-(opus|sonnet)-4\.[6-9]/.test(model);
  const enableThinking = hasReasoningEffort || hasThinkingConfig || isThinkingCapableModel;

  const { history, currentMessage, systemPrompt } = convertMessages(messages, tools, model);

  const profileArn = credentials?.providerSpecificData?.profileArn || "";

  let finalContent = currentMessage?.userInputMessage?.content || "";

  // Prepend system prompt to current message content — Kiro has no dedicated system field.
  // conversationId is generated fresh per request, so Kiro has no server-side memory of prior
  // turns — the full history is always sent. System prompt must be prepended every time.
  // Wrapped in <instructions> tags, which Claude models treat as authoritative directives.
  // Sent via content ONLY (not also via the systemInstruction field) — see convertMessages
  // above for why. Sending it twice would double the system-prompt token cost on every
  // request against Kiro's metered quota for no verified benefit.
  if (systemPrompt) {
    finalContent = `<instructions>\n${systemPrompt}\n</instructions>\n\n${finalContent}`;
  }

  const payload: KiroPayload = {
    conversationState: {
      chatTriggerType: "MANUAL",
      conversationId: uuidv4(),
      currentMessage: {
        userInputMessage: {
          content: finalContent,
          modelId: model,
          origin: "AI_EDITOR",
          ...(currentMessage?.userInputMessage?.userInputMessageContext && {
            userInputMessageContext: currentMessage.userInputMessage.userInputMessageContext,
          }),
          ...(enableThinking && {
            additionalModelRequestFields: {
              thinking: {
                type: "adaptive",
                display: "summarized",
              },
            },
          }),
        },
      },
      history: history,
    },
  };

  if (profileArn) {
    payload.profileArn = profileArn;
  }

  if (maxTokens || temperature !== undefined || topP !== undefined) {
    payload.inferenceConfig = {};
    if (maxTokens) payload.inferenceConfig.maxTokens = maxTokens;
    if (temperature !== undefined) payload.inferenceConfig.temperature = temperature;
    if (topP !== undefined) payload.inferenceConfig.topP = topP;
  }

  return payload;
}

register(FORMATS.OPENAI, FORMATS.KIRO, buildKiroPayload);
