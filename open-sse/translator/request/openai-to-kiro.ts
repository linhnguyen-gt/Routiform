/**
 * OpenAI to Kiro Request Translator
 * Converts OpenAI Chat Completions format to Kiro/AWS CodeWhisperer format
 */
import { register } from "../registry.ts";
import { FORMATS } from "../formats.ts";
import { v4 as uuidv4 } from "uuid";

const KIRO_DEFAULT_MAX_TOKENS = 4096;
const KIRO_MAX_OUTPUT_TOKENS = 8192;
const KIRO_MAX_TOOLS = 24;
const KIRO_MAX_TOOL_DESCRIPTION_CHARS = 400;
const KIRO_MAX_TOOL_INPUT_CHARS = 12000;
const KIRO_MAX_PAYLOAD_BYTES = 90000;
const KIRO_MAX_MESSAGES = 24;
const KIRO_MAX_SYSTEM_CHARS = 32000;

function clampKiroMaxTokens(body: Record<string, unknown>): number {
  const raw = body.max_tokens ?? body.maxTokens;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return KIRO_DEFAULT_MAX_TOKENS;
  }
  return Math.min(Math.floor(parsed), KIRO_MAX_OUTPUT_TOKENS);
}

function sanitizeKiroToolSchema(schema: unknown, toolName = ""): Record<string, unknown> {
  const schemaSafeFallback = {
    type: "object",
    properties: {},
    additionalProperties: true,
  };

  const strictTools = new Set([
    "read",
    "glob",
    "grep",
    "bash",
    "write",
    "edit",
    "apply_patch",
    "question",
    "task",
  ]);

  // Keep full schema for core tools so models keep required params like
  // read.filePath and bash.description.
  if (strictTools.has(toolName)) {
    if (schema && typeof schema === "object" && !Array.isArray(schema)) {
      return schema as Record<string, unknown>;
    }
    return schemaSafeFallback;
  }

  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return schemaSafeFallback;
  }

  // For non-core tools, keep schema compact to reduce malformed-request risk.
  return {
    type: "object",
    properties: {},
    additionalProperties: true,
  };
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function getPrioritizedKiroTools(tools: unknown[], messages: unknown[]): unknown[] {
  const preferredToolNames = new Set([
    "read",
    "glob",
    "grep",
    "bash",
    "write",
    "edit",
    "apply_patch",
    "question",
    "task",
  ]);

  const toolList = Array.isArray(tools) ? tools : [];
  if (toolList.length <= KIRO_MAX_TOOLS) {
    return toolList;
  }

  const calledNames = new Set<string>();
  for (const message of Array.isArray(messages) ? messages : []) {
    const toolCalls = (message as Record<string, unknown>)?.tool_calls;
    if (!Array.isArray(toolCalls)) {
      continue;
    }
    for (const tc of toolCalls) {
      const fn = (tc as Record<string, unknown>)?.function as Record<string, unknown> | undefined;
      const name = typeof fn?.name === "string" ? fn.name : "";
      if (name) {
        calledNames.add(name);
      }
    }
  }

  const prioritized = toolList.slice().sort((a, b) => {
    const aName = ((a as Record<string, unknown>)?.function as Record<string, unknown> | undefined)
      ?.name;
    const bName = ((b as Record<string, unknown>)?.function as Record<string, unknown> | undefined)
      ?.name;
    const aCalled = typeof aName === "string" && calledNames.has(aName) ? 1 : 0;
    const bCalled = typeof bName === "string" && calledNames.has(bName) ? 1 : 0;
    if (aCalled !== bCalled) {
      return bCalled - aCalled;
    }
    const aPreferred = typeof aName === "string" && preferredToolNames.has(aName) ? 1 : 0;
    const bPreferred = typeof bName === "string" && preferredToolNames.has(bName) ? 1 : 0;
    return bPreferred - aPreferred;
  });

  return prioritized.slice(0, KIRO_MAX_TOOLS);
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}...`;
}

function sanitizeToolInput(input: unknown): unknown {
  if (input === null || input === undefined) {
    return {};
  }
  if (typeof input === "string") {
    return truncateText(input, KIRO_MAX_TOOL_INPUT_CHARS);
  }
  try {
    const serialized = JSON.stringify(input);
    if (!serialized) {
      return {};
    }
    if (serialized.length <= KIRO_MAX_TOOL_INPUT_CHARS) {
      return input;
    }
    return { _truncated: true, preview: truncateText(serialized, KIRO_MAX_TOOL_INPUT_CHARS) };
  } catch {
    return {};
  }
}

function prepareKiroMessages(messages: unknown[]): unknown[] {
  const list = Array.isArray(messages) ? messages : [];
  if (list.length <= KIRO_MAX_MESSAGES) {
    return list;
  }

  const tail = list.slice(-KIRO_MAX_MESSAGES) as Record<string, unknown>[];
  const preservedSystems = list
    .filter((msg) => (msg as Record<string, unknown>)?.role === "system")
    .slice(-2)
    .map((systemMessage) => {
      const msg = systemMessage as Record<string, unknown>;
      if (typeof msg.content === "string") {
        return {
          ...msg,
          content: truncateText(msg.content, KIRO_MAX_SYSTEM_CHARS),
        };
      }
      return msg;
    });

  const systemContentsInTail = new Set(
    tail
      .filter((msg) => msg.role === "system" && typeof msg.content === "string")
      .map((msg) => String(msg.content))
  );

  const missingSystems = preservedSystems.filter((msg) => {
    const content = typeof msg.content === "string" ? msg.content : null;
    return content ? !systemContentsInTail.has(content) : true;
  });

  const merged = [...missingSystems, ...tail] as unknown[];
  return merged.slice(-KIRO_MAX_MESSAGES);
}

function trimHistoryToPayloadLimit(payload: {
  conversationState?: {
    history?: unknown[];
  };
}): void {
  const history = payload?.conversationState?.history;
  if (!Array.isArray(history) || history.length === 0) {
    return;
  }

  let serialized = "";
  try {
    serialized = JSON.stringify(payload);
  } catch {
    return;
  }

  while (Buffer.byteLength(serialized, "utf8") > KIRO_MAX_PAYLOAD_BYTES && history.length > 1) {
    history.shift();
    serialized = JSON.stringify(payload);
  }
}

function buildKiroToolSpecifications(tools: unknown[]): Array<Record<string, unknown>> {
  return (Array.isArray(tools) ? tools : []).map((tool) => {
    const t = tool as Record<string, unknown>;
    const fn = (t.function || {}) as Record<string, unknown>;
    const name = (fn.name || t.name || "tool") as string;
    let description = (fn.description || t.description || "") as string;

    if (!description.trim()) {
      description = `Tool: ${name}`;
    }

    return {
      toolSpecification: {
        name,
        description: truncateText(description, KIRO_MAX_TOOL_DESCRIPTION_CHARS),
        inputSchema: {
          json: sanitizeKiroToolSchema(
            fn.parameters || t.parameters || t.input_schema || {},
            String(name)
          ),
        },
      },
    };
  });
}

function normalizeKiroHistoryOrder(history: unknown[]): unknown[] {
  const items = Array.isArray(history) ? [...history] : [];

  while (items.length > 0) {
    const first = items[0] as Record<string, unknown>;
    if (first?.userInputMessage) {
      break;
    }
    items.shift();
  }

  return items;
}

/**
 * Convert OpenAI messages to Kiro format
 * Rules: system/tool/user -> user role, merge consecutive same roles
 */
function convertMessages(messages, tools, model) {
  let history = [];
  let currentMessage = null;

  let pendingUserContent = [];
  let pendingAssistantContent = [];
  let currentRole = null;

  const flushPending = () => {
    if (currentRole === "user") {
      const content = pendingUserContent.join("\n\n").trim() || "continue";
      const userMsg: {
        userInputMessage: {
          content: string;
          modelId: string;
          userInputMessageContext?: {
            tools?: Array<Record<string, unknown>>;
          };
        };
      } = {
        userInputMessage: {
          content: content,
          modelId: "",
        },
      };

      // Add tools to first user message
      if (tools && tools.length > 0 && history.length === 0) {
        if (!userMsg.userInputMessage.userInputMessageContext) {
          userMsg.userInputMessage.userInputMessageContext = {};
        }
        userMsg.userInputMessage.userInputMessageContext.tools = buildKiroToolSpecifications(tools);
      }

      history.push(userMsg);
      currentMessage = userMsg;
      pendingUserContent = [];
    } else if (currentRole === "assistant") {
      const content = pendingAssistantContent.join("\n\n").trim() || "...";
      const assistantMsg = {
        assistantResponseMessage: {
          content: content,
        },
      };
      history.push(assistantMsg);
      pendingAssistantContent = [];
    }
  };

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    let role = msg.role;

    // Normalize: system/tool -> user
    if (role === "system" || role === "tool") {
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
        const textParts = msg.content
          .filter((c) => c.type === "text" || c.text)
          .map((c) => c.text || "");
        content = textParts.join("\n");
      }

      // Handle tool role (from normalized)
      if (msg.role === "tool") {
        const toolContent =
          typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        if (toolContent) {
          pendingUserContent.push(`Tool result:\n${toolContent}`);
        }
      } else if (content) {
        pendingUserContent.push(content);
      }
    } else if (role === "assistant") {
      // Extract text content only for history stability
      let textContent = "";

      if (Array.isArray(msg.content)) {
        const textBlocks = msg.content.filter((c) => c.type === "text");
        textContent = textBlocks
          .map((b) => b.text)
          .join("\n")
          .trim();
      } else if (typeof msg.content === "string") {
        textContent = msg.content.trim();
      }

      if (textContent) {
        pendingAssistantContent.push(textContent);
      }
    }
  }

  // Flush remaining
  if (currentRole !== null) {
    flushPending();
  }

  // If last message in history is userInputMessage, use it as currentMessage
  if (history.length > 0 && history[history.length - 1].userInputMessage) {
    currentMessage = history.pop();
  }

  if (!currentMessage?.userInputMessage) {
    currentMessage = {
      userInputMessage: {
        content: "continue",
        modelId: model,
      },
    };
  }

  const firstHistoryItem = history[0];
  if (
    firstHistoryItem?.userInputMessage?.userInputMessageContext?.tools &&
    !currentMessage?.userInputMessage?.userInputMessageContext?.tools
  ) {
    if (!currentMessage.userInputMessage.userInputMessageContext) {
      currentMessage.userInputMessage.userInputMessageContext = {};
    }
    currentMessage.userInputMessage.userInputMessageContext.tools =
      firstHistoryItem.userInputMessage.userInputMessageContext.tools;
  }

  if (tools?.length > 0 && !currentMessage?.userInputMessage?.userInputMessageContext?.tools) {
    if (!currentMessage.userInputMessage.userInputMessageContext) {
      currentMessage.userInputMessage.userInputMessageContext = {};
    }
    currentMessage.userInputMessage.userInputMessageContext.tools =
      buildKiroToolSpecifications(tools);
  }

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
  });

  return { history: normalizeKiroHistoryOrder(history), currentMessage };
}

/**
 * Build Kiro payload from OpenAI format
 */
export function buildKiroPayload(model, body, stream, credentials) {
  const messages = prepareKiroMessages(body.messages || []);
  const originalTools = body.tools || [];
  const tools = getPrioritizedKiroTools(originalTools, messages);
  const maxTokens = clampKiroMaxTokens(body);
  const temperature = parseFiniteNumber(body.temperature);
  const topP = parseFiniteNumber(body.top_p);

  // Debug: Log what we received vs what we use
  const logger = console;
  if (process.env.DEBUG_KIRO === "1") {
    logger.log(
      `[KIRO] Received max_tokens: ${body.max_tokens || body.maxTokens}, using: ${maxTokens}`
    );
    if (Array.isArray(originalTools) && originalTools.length !== tools.length) {
      logger.log(`[KIRO] Tools reduced: ${originalTools.length} -> ${tools.length}`);
    }
  }

  const { history, currentMessage } = convertMessages(messages, tools, model);

  const profileArn = credentials?.providerSpecificData?.profileArn || "";

  let finalContent = currentMessage?.userInputMessage?.content || "";
  const timestamp = new Date().toISOString();
  finalContent = `[Context: Current time is ${timestamp}]\n\n${finalContent}`;

  const payload: {
    conversationState: {
      chatTriggerType: string;
      conversationId: string;
      currentMessage: {
        userInputMessage: {
          content: string;
          modelId: string;
          origin: string;
          userInputMessageContext?: Record<string, unknown>;
        };
      };
      history: unknown[];
    };
    profileArn?: string;
    inferenceConfig?: {
      maxTokens?: number;
      temperature?: number;
      topP?: number;
    };
  } = {
    conversationState: {
      chatTriggerType: "MANUAL",
      conversationId: uuidv4(), // We must override this with deterministic ID
      currentMessage: {
        userInputMessage: {
          content: finalContent,
          modelId: model,
          origin: "AI_EDITOR",
          ...(currentMessage?.userInputMessage?.userInputMessageContext && {
            userInputMessageContext: currentMessage.userInputMessage.userInputMessageContext,
          }),
        },
      },
      history: history,
    },
  };

  // Determistic session caching for Kiro
  const NAMESPACE_KIRO = "34f7193f-561d-4050-bc84-9547d953d6bf";
  const firstHistory = history[0] as { userInputMessage?: { content?: string } } | undefined;
  const firstContent =
    history.length > 0 && firstHistory?.userInputMessage?.content
      ? firstHistory.userInputMessage.content
      : finalContent;

  // Use uuidv5 with the hash of the system prompt / first message to maintain AWS Builder ID context cache
  const { v5: uuidv5 } = require("uuid");
  payload.conversationState.conversationId = uuidv5(
    (firstContent || "").substring(0, 4000),
    NAMESPACE_KIRO
  );

  if (profileArn) {
    payload.profileArn = profileArn;
  }

  if (maxTokens || temperature !== null || topP !== null) {
    payload.inferenceConfig = {};
    if (maxTokens) payload.inferenceConfig.maxTokens = maxTokens;
    if (temperature !== null) payload.inferenceConfig.temperature = temperature;
    if (topP !== null) payload.inferenceConfig.topP = topP;
  }

  trimHistoryToPayloadLimit(payload);

  if (process.env.DEBUG_KIRO === "1") {
    logger.log(`[KIRO] Payload bytes: ${Buffer.byteLength(JSON.stringify(payload), "utf8")}`);
  }

  return payload;
}

register(FORMATS.OPENAI, FORMATS.KIRO, buildKiroPayload, null);
