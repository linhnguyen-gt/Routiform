import type { McpToolExtraLike } from "../scopeEnforcement.ts";

export type McpTransportKind = "stdio" | "http";

export interface McpServerOptions {
  /** Transport the server is served over. Defaults to stdio (trusted local). */
  transport?: McpTransportKind;
  /**
   * Identity bound by the HTTP transport after bearer-key validation. When present it is
   * injected into every tool call's `extra.authInfo`, which scope enforcement reads.
   */
  authInfo?: { clientId: string; scopes: string[] };
}

export type JsonRecord = Record<string, unknown>;

export type TextToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export type ScopeEnforcedHandler = (
  toolName: string,
  handler: (args: unknown, extra?: McpToolExtraLike) => Promise<TextToolResult>
) => (args: unknown, extra?: McpToolExtraLike) => Promise<TextToolResult>;
