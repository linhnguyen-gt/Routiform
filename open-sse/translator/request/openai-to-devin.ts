import { FORMATS } from "../formats.ts";
import { register } from "../registry.ts";

type JsonRecord = Record<string, unknown>;

type OpenAIMessage = {
  role?: string;
  content?:
    | string
    | Array<{
        type?: string;
        text?: string;
        image_url?: { url?: string };
        source?: { type?: string; media_type?: string; data?: string };
      }>
    | null;
  tool_calls?: Array<{
    id?: string;
    function?: { name?: string; arguments?: string | JsonRecord };
  }>;
  tool_call_id?: string;
  name?: string;
};

type OpenAITool = {
  type?: string;
  function?: { name?: string; description?: string; parameters?: JsonRecord };
  name?: string;
  description?: string;
  input_schema?: JsonRecord;
  parameters?: JsonRecord;
};

function flattenText(content: OpenAIMessage["content"]): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content);

  const parts: string[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      parts.push(part);
      continue;
    }
    if (!part || typeof part !== "object") continue;
    if (typeof part.text === "string" && part.text.length > 0) {
      parts.push(part.text);
      continue;
    }
    if (part.type === "image_url" || part.type === "image") {
      parts.push("[image omitted]");
    }
  }

  return parts.join("\n");
}

function formatToolArguments(value: string | JsonRecord | undefined): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return JSON.stringify(value, null, 2);
  return "{}";
}

function formatTools(tools: unknown): string {
  if (!Array.isArray(tools) || tools.length === 0) return "";

  const rendered = (tools as OpenAITool[])
    .map((tool) => {
      if (!tool || typeof tool !== "object") return "";
      const fn = tool.function;
      const name = fn?.name || tool.name || "tool";
      const description = fn?.description || tool.description || "";
      const schema = fn?.parameters || tool.input_schema || tool.parameters;
      const parts = [`- ${name}`];
      if (description) parts.push(`  Description: ${description}`);
      if (schema) parts.push(`  Parameters: ${JSON.stringify(schema)}`);
      return parts.join("\n");
    })
    .filter(Boolean);

  return rendered.length > 0 ? `Available tools:\n${rendered.join("\n")}` : "";
}

function formatConversation(messages: OpenAIMessage[]): string {
  const lines: string[] = [];

  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const role = message.role || "user";
    const text = flattenText(message.content).trim();

    if (role === "system" || role === "developer") continue;

    if (role === "assistant") {
      if (text) lines.push(`Assistant:\n${text}`);
      if (Array.isArray(message.tool_calls)) {
        for (const toolCall of message.tool_calls) {
          const name = toolCall?.function?.name || "tool";
          lines.push(
            `Assistant called tool ${name}:\n${formatToolArguments(toolCall?.function?.arguments)}`
          );
        }
      }
      continue;
    }

    if (role === "tool") {
      const toolName = message.name || message.tool_call_id || "tool";
      lines.push(`Tool ${toolName} result:\n${text || "(empty)"}`);
      continue;
    }

    lines.push(`User:\n${text || "(empty)"}`);
  }

  return lines.join("\n\n").trim();
}

export function openaiToDevin(
  _model: string,
  body: Record<string, unknown>
): Record<string, unknown> {
  const messages = Array.isArray(body.messages) ? (body.messages as OpenAIMessage[]) : [];
  const system = messages
    .filter((message) => message?.role === "system" || message?.role === "developer")
    .map((message) => flattenText(message.content).trim())
    .filter(Boolean)
    .join("\n\n");
  const tools = formatTools(body.tools);
  const conversation = formatConversation(messages);

  const promptSections = [system ? `Instructions:\n${system}` : "", tools, conversation]
    .filter(Boolean)
    .join("\n\n");

  return {
    prompt: promptSections,
  };
}

register(FORMATS.OPENAI, FORMATS.DEVIN, openaiToDevin);
