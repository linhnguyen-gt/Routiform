/**
 * Coerce string-encoded numeric JSON Schema constraints to their proper types.
 * Some clients (Cursor, Cline, etc.) send e.g. "minimum": "1" instead of "minimum": 1,
 * which causes 400 errors on strict providers like Claude and OpenAI.
 */

const NUMERIC_SCHEMA_FIELDS = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minProperties",
  "maxProperties",
  "multipleOf",
] as const;

export function coerceSchemaNumericFields(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(coerceSchemaNumericFields);

  const result = { ...schema };

  for (const field of NUMERIC_SCHEMA_FIELDS) {
    if (field in result && typeof result[field] === "string") {
      const num = Number(result[field]);
      if (!isNaN(num) && isFinite(num)) {
        result[field] = num;
      }
    }
  }

  // Recurse into nested schema structures
  if (result.properties && typeof result.properties === "object") {
    result.properties = Object.fromEntries(
      Object.entries(result.properties).map(([key, val]) => [key, coerceSchemaNumericFields(val)])
    );
  }
  if (result.items) {
    result.items = coerceSchemaNumericFields(result.items);
  }
  if (result.additionalProperties && typeof result.additionalProperties === "object") {
    result.additionalProperties = coerceSchemaNumericFields(result.additionalProperties);
  }
  if (Array.isArray(result.anyOf)) {
    result.anyOf = result.anyOf.map(coerceSchemaNumericFields);
  }
  if (Array.isArray(result.oneOf)) {
    result.oneOf = result.oneOf.map(coerceSchemaNumericFields);
  }
  if (Array.isArray(result.allOf)) {
    result.allOf = result.allOf.map(coerceSchemaNumericFields);
  }
  if (result.not && typeof result.not === "object") {
    result.not = coerceSchemaNumericFields(result.not);
  }

  return result;
}

/**
 * Apply schema coercion to all tools in a request body.
 * Handles both OpenAI format (function.parameters) and Claude format (input_schema).
 */
export function coerceToolSchemas(tools: any[]): any[] {
  if (!Array.isArray(tools)) return tools;

  return tools.map((tool) => {
    if (!tool || typeof tool !== "object") return tool;

    const result = { ...tool };

    // OpenAI format: tool.function.parameters
    if (result.function?.parameters) {
      result.function = {
        ...result.function,
        parameters: coerceSchemaNumericFields(result.function.parameters),
      };
    }

    // Claude format: tool.input_schema
    if (result.input_schema) {
      result.input_schema = coerceSchemaNumericFields(result.input_schema);
    }

    // Direct parameters (some formats)
    if (result.parameters && !result.function) {
      result.parameters = coerceSchemaNumericFields(result.parameters);
    }

    return result;
  });
}

/**
 * Ensure tool.description is always a string.
 * Some clients send null, undefined, or numeric descriptions.
 */
export function sanitizeToolDescription(tool: any): any {
  if (!tool || typeof tool !== "object") return tool;

  const result = { ...tool };

  // OpenAI format: tool.function.description
  if (result.function && result.function.description !== undefined) {
    if (result.function.description === null) {
      result.function = { ...result.function, description: "" };
    } else if (typeof result.function.description !== "string") {
      result.function = { ...result.function, description: String(result.function.description) };
    }
  }

  // Claude format: tool.description (direct)
  if ("description" in result && !result.function) {
    if (result.description === null) {
      result.description = "";
    } else if (typeof result.description !== "string") {
      result.description = String(result.description);
    }
  }

  return result;
}

/**
 * Apply description sanitization to all tools in a request body.
 */
export function sanitizeToolDescriptions(tools: any[]): any[] {
  if (!Array.isArray(tools)) return tools;
  return tools.map(sanitizeToolDescription);
}
