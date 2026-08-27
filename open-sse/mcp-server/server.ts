/**
 * Routiform MCP Server — Model Context Protocol server exposing
 * Routiform gateway intelligence as tools for AI agents.
 *
 * Supports two transports:
 *   1. stdio  — for IDE integration (VS Code, Cursor, Claude Desktop)
 *   2. HTTP   — for remote/programmatic access
 *
 * Tools wrap existing Routiform API endpoints and add intelligence
 * such as routing simulation, budget guards, and session snapshots.
 *
 * This file is the executable entrypoint. Tool-call dispatch, handlers, and
 * configuration live in the ./server/ modules.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MCP_TOOLS } from "./schemas/tools.ts";
import { startMcpHeartbeat } from "./runtimeHeartbeat.ts";
import { FULL_TOOL_SCOPES } from "./server/config.ts";
import { createMcpServer } from "./server/registerTools.ts";

export { createMcpServer };
export type {
  McpServerOptions,
  McpTransportKind,
  TextToolResult,
  JsonRecord,
} from "./server/types.ts";

// ============ Main Entry Point (stdio) ============

/**
 * Start the MCP server with stdio transport.
 * Called when `routiform --mcp` is used.
 */
export async function startMcpStdio(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  const version = process.env.npm_package_version || "1.8.1";
  const stopHeartbeat = startMcpHeartbeat({
    version,
    scopesEnforced: process.env.ROUTIFORM_MCP_ENFORCE_SCOPES === "true",
    allowedScopes: [...FULL_TOOL_SCOPES],
    toolCount: MCP_TOOLS.length,
  });
  const stopHeartbeatOnce = () => {
    stopHeartbeat();
  };
  process.once("exit", stopHeartbeatOnce);
  process.once("SIGINT", stopHeartbeatOnce);
  process.once("SIGTERM", stopHeartbeatOnce);

  console.error("[MCP] Routiform MCP Server starting (stdio transport)...");
  try {
    await server.connect(transport);
    console.error("[MCP] Routiform MCP Server connected and ready.");
  } finally {
    stopHeartbeatOnce();
    process.off("exit", stopHeartbeatOnce);
    process.off("SIGINT", stopHeartbeatOnce);
    process.off("SIGTERM", stopHeartbeatOnce);
  }
}

// If this file is run directly, start stdio server
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  startMcpStdio().catch((err) => {
    console.error("[MCP] Fatal error:", err);
    process.exit(1);
  });
}
