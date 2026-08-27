import { readRecord, toNonEmptyString } from "./shared.ts";

function convertClaudeCodeCompatibleTool(tool: unknown) {
  const rawTool = readRecord(tool);
  if (!rawTool) return null;

  const toolData = rawTool.type === "function" ? readRecord(rawTool.function) || rawTool : rawTool;

  const name = toNonEmptyString(toolData.name);
  if (!name) return null;

  const rawSchema = readRecord(toolData.parameters) ||
    readRecord(toolData.input_schema) || { type: "object", properties: {}, required: [] };
  const inputSchema =
    rawSchema.type === "object" && !readRecord(rawSchema.properties)
      ? { ...rawSchema, properties: {} }
      : rawSchema;

  const converted: Record<string, unknown> = {
    name,
    description: toNonEmptyString(toolData.description) || "",
    input_schema: inputSchema,
  };

  if (typeof toolData.defer_loading === "boolean") {
    converted.defer_loading = toolData.defer_loading;
  }

  return converted;
}

function buildClaudeCodeCompatibleTools(
  normalizedBody?: Record<string, unknown> | null,
  sourceBody?: Record<string, unknown> | null
) {
  const rawTools = Array.isArray(normalizedBody?.["tools"])
    ? normalizedBody?.["tools"]
    : Array.isArray(sourceBody?.["tools"])
      ? sourceBody?.["tools"]
      : [];

  return rawTools
    .map((tool) => convertClaudeCodeCompatibleTool(tool))
    .filter((tool): tool is Record<string, unknown> => !!tool)
    .map((tool) => ({ ...tool }));
}

function buildClaudeCodeCompatibleToolsFromClaude(
  tools: Record<string, unknown>[] | undefined,
  preserveCacheControl: boolean
) {
  if (!Array.isArray(tools)) return [];

  return tools.map((tool) => {
    const preparedTool = { ...tool };
    if (!preserveCacheControl) {
      delete preparedTool.cache_control;
    }
    return preparedTool;
  });
}

function buildClaudeCodeCompatibleToolChoice(choice: unknown) {
  if (!choice) return null;

  if (typeof choice === "string") {
    if (choice === "required") return { type: "any" };
    return null;
  }

  const rawChoice = readRecord(choice);
  if (!rawChoice) return null;

  if (rawChoice.type === "tool") {
    const name = toNonEmptyString(rawChoice.name);
    return name ? { type: "tool", name } : null;
  }

  if (rawChoice.type === "function") {
    const functionName =
      toNonEmptyString(readRecord(rawChoice.function)?.name) || toNonEmptyString(rawChoice.name);
    return functionName ? { type: "tool", name: functionName } : null;
  }

  if (rawChoice.type === "required" || rawChoice.type === "any") {
    return { type: "any" };
  }

  return null;
}

export {
  buildClaudeCodeCompatibleToolChoice,
  buildClaudeCodeCompatibleTools,
  buildClaudeCodeCompatibleToolsFromClaude,
};
