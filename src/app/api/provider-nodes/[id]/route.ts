import { NextResponse } from "next/server";
import {
  deleteProviderConnectionsByProvider,
  deleteProviderNode,
  getProviderConnections,
  getProviderNodeById,
  updateProviderConnection,
  updateProviderNode,
} from "@/models";
import { isClaudeCodeCompatibleProvider } from "@/shared/constants/providers";
import { updateProviderNodeSchema } from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { isHostSecretAuthenticated } from "@/shared/utils/apiAuth";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function sanitizeAnthropicBaseUrl(baseUrl: string) {
  return (baseUrl || "")
    .trim()
    .replace(/\/$/, "")
    .replace(/\/messages(?:\?[^#]*)?$/i, "");
}

function sanitizeClaudeCodeCompatibleBaseUrl(baseUrl: string) {
  return (baseUrl || "")
    .trim()
    .replace(/\/$/, "")
    .replace(/\/(?:v\d+\/)?messages(?:\?[^#]*)?$/i, "");
}

// PUT /api/provider-nodes/[id] - Update provider node
// Session-only, for the same reason as POST /api/provider-nodes: it sets the base URL the
// model-listing path fetches with the loopback opt-in.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isHostSecretAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          message: "Invalid request",
          details: [{ field: "body", message: "Invalid JSON body" }],
        },
      },
      { status: 400 }
    );
  }

  try {
    const { id } = await params;
    const validation = validateBody(updateProviderNodeSchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { name, prefix, apiType, baseUrl, chatPath, modelsPath } = validation.data;
    const node: Record<string, unknown> = await getProviderNodeById(id);

    if (!node) {
      return NextResponse.json({ error: "Provider node not found" }, { status: 404 });
    }

    // Only validate apiType for OpenAI Compatible nodes
    if (
      node.type === "openai-compatible" &&
      (!apiType || !["chat", "responses"].includes(apiType))
    ) {
      return NextResponse.json({ error: "Invalid OpenAI compatible API type" }, { status: 400 });
    }

    let sanitizedBaseUrl = baseUrl.trim();

    // Sanitize Base URL for Anthropic Compatible
    if (node.type === "anthropic-compatible") {
      sanitizedBaseUrl = isClaudeCodeCompatibleProvider(id)
        ? sanitizeClaudeCodeCompatibleBaseUrl(sanitizedBaseUrl)
        : sanitizeAnthropicBaseUrl(sanitizedBaseUrl);
    }

    const updates: Record<string, unknown> = {
      name: name.trim(),
      prefix: prefix.trim(),
      baseUrl: sanitizedBaseUrl,
      chatPath: chatPath || null,
      modelsPath: isClaudeCodeCompatibleProvider(id) ? null : modelsPath || null,
    };

    if (node.type === "openai-compatible") {
      updates.apiType = apiType;
    }

    const updated = await updateProviderNode(id, updates);

    const connections = await getProviderConnections({ provider: id });
    await Promise.all(
      connections.flatMap((connectionRaw) => {
        const connection = asRecord(connectionRaw);
        const connectionId = typeof connection.id === "string" ? connection.id : "";
        if (!connectionId) return [];

        const providerSpecificData = {
          ...asRecord(connection.providerSpecificData),
          prefix: prefix.trim(),
          baseUrl: sanitizedBaseUrl,
          nodeName: updated.name,
          chatPath: updated.chatPath || undefined,
        } as JsonRecord;
        if (updated.modelsPath) {
          providerSpecificData.modelsPath = updated.modelsPath;
        } else {
          delete providerSpecificData.modelsPath;
        }
        if (node.type === "openai-compatible") {
          providerSpecificData.apiType = apiType;
        }

        return [
          updateProviderConnection(connectionId, {
            providerSpecificData,
          }),
        ];
      })
    );

    return NextResponse.json({ node: updated });
  } catch (error) {
    console.log("Error updating provider node:", error);
    return NextResponse.json({ error: "Failed to update provider node" }, { status: 500 });
  }
}

// DELETE /api/provider-nodes/[id] - Delete provider node and its connections
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isHostSecretAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const node = await getProviderNodeById(id);

    if (!node) {
      return NextResponse.json({ error: "Provider node not found" }, { status: 404 });
    }

    await deleteProviderConnectionsByProvider(id);
    await deleteProviderNode(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error deleting provider node:", error);
    return NextResponse.json({ error: "Failed to delete provider node" }, { status: 500 });
  }
}
