/**
 * OpenAI to Kiro Request Translator
 * Converts OpenAI Chat Completions format to Kiro/AWS CodeWhisperer format.
 */
import { register } from "../registry.ts";
import { FORMATS } from "../formats.ts";
import { v4 as uuidv4 } from "uuid";

type JsonRecord = Record<string, unknown>;

type OpenAIImagePart = {
  type?: string;
  image_url?: { url?: string };
  source?: { type?: string; media_type?: string; data?: string };
  text?: string;
};

type OpenAIMessage = {
  role?: string;
  content?: string | OpenAIImagePart[] | null;
  tool_calls?: Array<{
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: unknown };
  }>;
  tool_call_id?: string;
  name?: string;
};

type OpenAITool = {
  function?: {
    name?: string;
    description?: string;
    parameters?: unknown;
  };
  name?: string;
  description?: string;
  parameters?: unknown;
  input_schema?: unknown;
};

type KiroImage = {
  format: string;
  source: { bytes: string };
};

type KiroToolResult = {
  toolUseId: string;
  status: "success";
  content: Array<{ text: string }>;
};

type KiroToolUse = {
  toolUseId: string;
  name: string;
  input: unknown;
};

type KiroToolSpec = {
  toolSpecification: {
    name: string;
    description: string;
    inputSchema: { json: JsonRecord };
  };
};

type KiroToolContext = {
  toolResults?: KiroToolResult[];
  tools?: KiroToolSpec[];
};

type KiroUserInputMessage = {
  content: string;
  modelId: string;
  images?: KiroImage[];
  userInputMessageContext?: KiroToolContext;
  origin?: string;
};

type KiroHistoryItem = {
  userInputMessage?: KiroUserInputMessage;
  assistantResponseMessage?: {
    content: string;
    toolUses?: KiroToolUse[];
  };
};

type CanonicalUserTurn = {
  textParts: string[];
  images: KiroImage[];
  toolResults: KiroToolResult[];
};

type CanonicalAssistantTurn = {
  textParts: string[];
  toolUses: KiroToolUse[];
};

type KiroPayload = {
  conversationState: {
    chatTriggerType: "MANUAL";
    conversationId: string;
    currentMessage: {
      userInputMessage: KiroUserInputMessage;
    };
    history: KiroHistoryItem[];
  };
  profileArn?: string;
  inferenceConfig?: {
    maxTokens?: number;
    temperature?: unknown;
    topP?: unknown;
  };
};

function toNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function ensureObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function normalizeSchema(schema: unknown): JsonRecord {
  const raw = ensureObject(schema);
  const properties = ensureObject(raw.properties);
  const required = Array.isArray(raw.required)
    ? raw.required.filter((item): item is string => typeof item === "string")
    : [];

  return {
    ...raw,
    type: typeof raw.type === "string" ? raw.type : "object",
    properties,
    required,
  };
}

function parseToolInput(argumentsValue: unknown): unknown {
  if (typeof argumentsValue !== "string") {
    return argumentsValue ?? {};
  }

  const trimmed = argumentsValue.trim();
  if (!trimmed) return {};

  try {
    return JSON.parse(trimmed);
  } catch {
    return { raw: trimmed };
  }
}

function normalizeToolResultContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content == null ? "" : JSON.stringify(content);

  return content
    .map((item) => {
      if (typeof item === "string") return item;
      const record = ensureObject(item);
      return typeof record.text === "string" ? record.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function createEmptyUserTurn(): CanonicalUserTurn {
  return { textParts: [], images: [], toolResults: [] };
}

function createEmptyAssistantTurn(): CanonicalAssistantTurn {
  return { textParts: [], toolUses: [] };
}

function extractUserContentParts(content: OpenAIMessage["content"]): {
  textParts: string[];
  images: KiroImage[];
  toolResults: KiroToolResult[];
} {
  if (typeof content === "string") {
    return { textParts: content ? [content] : [], images: [], toolResults: [] };
  }

  if (!Array.isArray(content)) {
    return { textParts: [], images: [], toolResults: [] };
  }

  const textParts: string[] = [];
  const images: KiroImage[] = [];
  const toolResults: KiroToolResult[] = [];

  for (const part of content) {
    const type = typeof part?.type === "string" ? part.type : "";

    if (type === "tool_result") {
      const block = part as OpenAIImagePart & { tool_use_id?: string; content?: unknown };
      const toolUseId = toNonEmptyString(block.tool_use_id);
      if (!toolUseId) continue;
      toolResults.push({
        toolUseId,
        status: "success",
        content: [{ text: normalizeToolResultContent(block.content) }],
      });
      continue;
    }

    if (type === "image_url") {
      const url = typeof part.image_url?.url === "string" ? part.image_url.url : "";
      const base64Match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (base64Match) {
        const mediaType = base64Match[1];
        images.push({
          format: mediaType.split("/")[1] || mediaType,
          source: { bytes: base64Match[2] },
        });
      } else if (url.startsWith("http://") || url.startsWith("https://")) {
        textParts.push(`[Image: ${url}]`);
      }
      continue;
    }

    if (
      type === "image" &&
      part.source?.type === "base64" &&
      typeof part.source.data === "string"
    ) {
      const mediaType =
        typeof part.source.media_type === "string" ? part.source.media_type : "image/png";
      images.push({
        format: mediaType.split("/")[1] || mediaType,
        source: { bytes: part.source.data },
      });
      continue;
    }

    const text = typeof part.text === "string" ? part.text : "";
    if (text) textParts.push(text);
  }

  return { textParts, images, toolResults };
}

function extractAssistantTurn(message: OpenAIMessage): CanonicalAssistantTurn {
  const turn = createEmptyAssistantTurn();

  if (typeof message.content === "string") {
    if (message.content.trim()) turn.textParts.push(message.content.trim());
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part?.type === "text" && typeof part.text === "string" && part.text.trim()) {
        turn.textParts.push(part.text.trim());
      }
      if (part?.type === "tool_use") {
        const block = part as OpenAIImagePart & { id?: string; name?: string; input?: unknown };
        const name = toNonEmptyString(block.name);
        if (!name) continue;
        turn.toolUses.push({
          toolUseId: toNonEmptyString(block.id) || uuidv4(),
          name,
          input: block.input ?? {},
        });
      }
    }
  }

  if (Array.isArray(message.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      const name = toNonEmptyString(toolCall.function?.name);
      if (!name) continue;
      turn.toolUses.push({
        toolUseId: toNonEmptyString(toolCall.id) || uuidv4(),
        name,
        input: parseToolInput(toolCall.function?.arguments),
      });
    }
  }

  return turn;
}

function buildToolSpecs(tools: unknown): KiroToolSpec[] {
  if (!Array.isArray(tools)) return [];

  return tools
    .map((tool) => {
      const typedTool = tool as OpenAITool;
      const name = toNonEmptyString(typedTool.function?.name || typedTool.name);
      if (!name) return null;

      const description =
        toNonEmptyString(typedTool.function?.description || typedTool.description) ||
        `Tool: ${name}`;
      const schema = normalizeSchema(
        typedTool.function?.parameters ?? typedTool.parameters ?? typedTool.input_schema ?? {}
      );

      return {
        toolSpecification: {
          name,
          description,
          inputSchema: { json: schema },
        },
      };
    })
    .filter((tool): tool is KiroToolSpec => Boolean(tool));
}

function finalizeUserMessage(turn: CanonicalUserTurn, model: string): KiroUserInputMessage {
  const text = turn.textParts.join("\n\n").trim() || "continue";
  const message: KiroUserInputMessage = {
    content: text,
    modelId: model,
  };

  if (turn.images.length > 0) {
    message.images = turn.images;
  }

  if (turn.toolResults.length > 0) {
    message.userInputMessageContext = {
      toolResults: turn.toolResults,
    };
  }

  return message;
}

function finalizeAssistantMessage(turn: CanonicalAssistantTurn): KiroHistoryItem | null {
  const content = turn.textParts.join("\n\n").trim() || (turn.toolUses.length > 0 ? "..." : "");
  if (!content && turn.toolUses.length === 0) return null;

  return {
    assistantResponseMessage: {
      content,
      ...(turn.toolUses.length > 0 ? { toolUses: turn.toolUses } : {}),
    },
  };
}

function validateKiroPayload(payload: KiroPayload): KiroPayload {
  const currentUserInput = payload.conversationState.currentMessage.userInputMessage;
  currentUserInput.content = currentUserInput.content.trim() || "continue";
  currentUserInput.modelId = currentUserInput.modelId || "unknown";

  if (
    currentUserInput.userInputMessageContext &&
    Object.keys(currentUserInput.userInputMessageContext).length === 0
  ) {
    delete currentUserInput.userInputMessageContext;
  }

  payload.conversationState.history = payload.conversationState.history.filter((item) => {
    if (item.userInputMessage) {
      item.userInputMessage.modelId = item.userInputMessage.modelId || currentUserInput.modelId;
      item.userInputMessage.content = item.userInputMessage.content.trim() || "continue";

      if (item.userInputMessage.userInputMessageContext?.tools) {
        delete item.userInputMessage.userInputMessageContext.tools;
      }

      if (
        item.userInputMessage.userInputMessageContext &&
        Object.keys(item.userInputMessage.userInputMessageContext).length === 0
      ) {
        delete item.userInputMessage.userInputMessageContext;
      }

      return true;
    }

    if (item.assistantResponseMessage) {
      item.assistantResponseMessage.content = item.assistantResponseMessage.content.trim() || "...";
      return true;
    }

    return false;
  });

  return payload;
}

function convertMessages(messages: unknown, tools: unknown, model: string) {
  const history: KiroHistoryItem[] = [];
  let activeUserTurn: CanonicalUserTurn | null = null;
  let activeAssistantTurn: CanonicalAssistantTurn | null = null;

  const flushUserTurn = () => {
    if (!activeUserTurn) return;
    history.push({ userInputMessage: finalizeUserMessage(activeUserTurn, model) });
    activeUserTurn = null;
  };

  const flushAssistantTurn = () => {
    if (!activeAssistantTurn) return;
    const assistantMessage = finalizeAssistantMessage(activeAssistantTurn);
    if (assistantMessage) history.push(assistantMessage);
    activeAssistantTurn = null;
  };

  const typedMessages = Array.isArray(messages) ? (messages as OpenAIMessage[]) : [];

  for (const message of typedMessages) {
    const role = typeof message.role === "string" ? message.role : "user";

    if (role === "assistant") {
      flushUserTurn();
      if (!activeAssistantTurn) activeAssistantTurn = createEmptyAssistantTurn();
      const extracted = extractAssistantTurn(message);
      activeAssistantTurn.textParts.push(...extracted.textParts);
      activeAssistantTurn.toolUses.push(...extracted.toolUses);
      continue;
    }

    flushAssistantTurn();
    if (!activeUserTurn) activeUserTurn = createEmptyUserTurn();

    if (role === "tool") {
      const toolCallId = toNonEmptyString(message.tool_call_id);
      if (toolCallId) {
        activeUserTurn.toolResults.push({
          toolUseId: toolCallId,
          status: "success",
          content: [{ text: typeof message.content === "string" ? message.content : "" }],
        });
      }
      continue;
    }

    const extracted = extractUserContentParts(message.content);
    activeUserTurn.textParts.push(...extracted.textParts);
    activeUserTurn.images.push(...extracted.images);
    activeUserTurn.toolResults.push(...extracted.toolResults);
  }

  flushAssistantTurn();
  flushUserTurn();

  let currentMessage: KiroHistoryItem | null = null;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].userInputMessage) {
      currentMessage = history.splice(index, 1)[0];
      break;
    }
  }

  if (!currentMessage?.userInputMessage) {
    currentMessage = {
      userInputMessage: {
        content: "continue",
        modelId: model,
      },
    };
  }

  const toolSpecs = buildToolSpecs(tools);
  if (toolSpecs.length > 0) {
    currentMessage.userInputMessage.userInputMessageContext = {
      ...(currentMessage.userInputMessage.userInputMessageContext ?? {}),
      tools: toolSpecs,
    };
  }

  return { history, currentMessage };
}

export function buildKiroPayload(
  model: string,
  body: Record<string, unknown>,
  stream: boolean,
  credentials?: { providerSpecificData?: { profileArn?: string } }
): KiroPayload {
  void stream;

  const messages = body.messages;
  const tools = body.tools;
  const { history, currentMessage } = convertMessages(messages, tools, model);
  const timestamp = new Date().toISOString();
  const finalContent = `[Context: Current time is ${timestamp}]\n\n${currentMessage.userInputMessage.content}`;

  const payload: KiroPayload = {
    conversationState: {
      chatTriggerType: "MANUAL",
      conversationId: uuidv4(),
      currentMessage: {
        userInputMessage: {
          ...currentMessage.userInputMessage,
          content: finalContent,
          origin: "AI_EDITOR",
        },
      },
      history,
    },
  };

  const profileArn = credentials?.providerSpecificData?.profileArn;
  if (profileArn) {
    payload.profileArn = profileArn;
  }

  payload.inferenceConfig = {
    maxTokens: 32000,
  };

  if (body.temperature !== undefined) {
    payload.inferenceConfig.temperature = body.temperature;
  }

  if (body.top_p !== undefined) {
    payload.inferenceConfig.topP = body.top_p;
  }

  return validateKiroPayload(payload);
}

register(FORMATS.OPENAI, FORMATS.KIRO, buildKiroPayload, null);
