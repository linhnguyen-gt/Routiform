/**
 * MCP Tool Schemas — contracts for every Routiform MCP tool.
 *
 * Each tool group's schemas live in a sibling module; this file keeps the shared
 * `McpToolDefinition`/`AuditLevel` contract types and re-exports every schema so
 * external importers keep importing from `./tools.ts` unchanged.
 *
 * Every registered tool must appear in MCP_TOOLS: scope enforcement resolves a tool's
 * requirements from this registry, and a tool missing from it cannot be checked.
 */

import { z } from "zod";
// memory.ts imports McpToolDefinition as a type only, so this is not a runtime cycle.
import { memorySearchTool, memoryAddTool, memoryClearTool } from "./memory.ts";
import { getHealthTool, checkQuotaTool, getProviderMetricsTool } from "./health.ts";
import {
  listCombosTool,
  getComboMetricsTool,
  switchComboTool,
  setRoutingStrategyTool,
  testComboTool,
  bestComboForTaskTool,
} from "./combos.ts";
import {
  routeRequestTool,
  costReportTool,
  setBudgetGuardTool,
  getSessionSnapshotTool,
} from "./usage.ts";
import { listModelsCatalogTool, syncPricingTool, listFreeTiersTool } from "./models.ts";
import { webSearchTool, simulateRouteTool } from "./search.ts";
import { setResilienceProfileTool } from "./resilience.ts";
import { cacheStatsTool, cacheFlushTool, getCompressionInfoTool } from "./cache.ts";

// ============ Shared Types ============

export type AuditLevel = "none" | "basic" | "full";

export interface McpToolDefinition<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny> {
  /** Tool name (MCP identifier) */
  name: string;
  /** Human-readable description for AI agents */
  description: string;
  /** Zod schema for input validation */
  inputSchema: TInput;
  /** Zod schema for output validation */
  outputSchema: TOutput;
  /** Required API key scopes */
  scopes: readonly string[];
  /** Audit logging level */
  auditLevel: AuditLevel;
  /** Phase: 1 = essential, 2 = advanced */
  phase: 1 | 2;
  /** Source endpoints on Routiform that this tool wraps */
  sourceEndpoints: readonly string[];
}

// ============ Schema Re-exports ============

export {
  getHealthInput,
  getHealthOutput,
  getHealthTool,
  checkQuotaInput,
  checkQuotaOutput,
  checkQuotaTool,
  getProviderMetricsInput,
  getProviderMetricsOutput,
  getProviderMetricsTool,
} from "./health.ts";

export {
  listCombosInput,
  listCombosOutput,
  listCombosTool,
  getComboMetricsInput,
  getComboMetricsOutput,
  getComboMetricsTool,
  switchComboInput,
  switchComboOutput,
  switchComboTool,
  setRoutingStrategyInput,
  setRoutingStrategyOutput,
  setRoutingStrategyTool,
  testComboInput,
  testComboOutput,
  testComboTool,
  bestComboForTaskInput,
  bestComboForTaskOutput,
  bestComboForTaskTool,
} from "./combos.ts";

export {
  routeRequestInput,
  routeRequestOutput,
  routeRequestTool,
  costReportInput,
  costReportOutput,
  costReportTool,
  setBudgetGuardInput,
  setBudgetGuardOutput,
  setBudgetGuardTool,
  getSessionSnapshotInput,
  getSessionSnapshotOutput,
  getSessionSnapshotTool,
} from "./usage.ts";

export {
  listModelsCatalogInput,
  listModelsCatalogOutput,
  listModelsCatalogTool,
  syncPricingInput,
  syncPricingOutput,
  syncPricingTool,
  listFreeTiersInput,
  listFreeTiersOutput,
  listFreeTiersTool,
} from "./models.ts";

export {
  webSearchInput,
  webSearchOutput,
  webSearchTool,
  simulateRouteInput,
  simulateRouteOutput,
  simulateRouteTool,
} from "./search.ts";

export {
  setResilienceProfileInput,
  setResilienceProfileOutput,
  setResilienceProfileTool,
} from "./resilience.ts";

export {
  cacheStatsInput,
  cacheStatsOutput,
  cacheStatsTool,
  cacheFlushInput,
  cacheFlushOutput,
  cacheFlushTool,
  getCompressionInfoInput,
  getCompressionInfoOutput,
  getCompressionInfoTool,
} from "./cache.ts";

// ============ Tool Registry ============

/** All MCP tool definitions, ordered by phase then name */
export const MCP_TOOLS = [
  getHealthTool,
  listCombosTool,
  getComboMetricsTool,
  switchComboTool,
  checkQuotaTool,
  routeRequestTool,
  costReportTool,
  listModelsCatalogTool,
  listFreeTiersTool,
  getCompressionInfoTool,
  webSearchTool,
  simulateRouteTool,
  setBudgetGuardTool,
  setRoutingStrategyTool,
  setResilienceProfileTool,
  testComboTool,
  getProviderMetricsTool,
  bestComboForTaskTool,
  getSessionSnapshotTool,
  syncPricingTool,
  cacheStatsTool,
  cacheFlushTool,
  memorySearchTool,
  memoryAddTool,
  memoryClearTool,
] as const;

/** Essential tools only (Phase 1) */
export const MCP_ESSENTIAL_TOOLS = MCP_TOOLS.filter((t) => t.phase === 1);

/** Advanced tools only (Phase 2) */
export const MCP_ADVANCED_TOOLS = MCP_TOOLS.filter((t) => t.phase === 2);

/** Map of tool name → tool definition */
export const MCP_TOOL_MAP = Object.fromEntries(MCP_TOOLS.map((t) => [t.name, t])) as Record<
  string,
  (typeof MCP_TOOLS)[number]
>;
