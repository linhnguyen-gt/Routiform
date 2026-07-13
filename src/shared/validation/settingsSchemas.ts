/**
 * Settings-specific Zod schemas.
 *
 * Extracted from schemas.ts to work around the webpack barrel-file
 * optimization bug that makes large schema barrel exports `undefined`
 * at runtime (see: https://github.com/vercel/next.js/issues/12557).
 */
import { z } from "zod";
import { HIDEABLE_SIDEBAR_ITEM_IDS } from "@/shared/constants/sidebarVisibility";

export const updateSettingsSchema = z.object({
  newPassword: z.string().min(1).max(200).optional(),
  currentPassword: z.string().max(200).optional(),
  theme: z.string().max(50).optional(),
  language: z.string().max(10).optional(),
  requireLogin: z.boolean().optional(),
  autoBackupEnabled: z.boolean().optional(),
  enableSocks5Proxy: z.boolean().optional(),
  instanceName: z.string().max(100).optional(),
  customLogoUrl: z.string().max(2000).optional(),
  customLogoBase64: z.string().max(100000).optional(),
  customFaviconUrl: z.string().max(2000).optional(),
  customFaviconBase64: z.string().max(50000).optional(),
  corsOrigins: z.string().max(500).optional(),
  cloudUrl: z.string().max(500).optional(),
  baseUrl: z.string().max(500).optional(),
  setupComplete: z.boolean().optional(),
  requireAuthForModels: z.boolean().optional(),
  blockedProviders: z.array(z.string().max(100)).optional(),
  hideHealthCheckLogs: z.boolean().optional(),
  debugMode: z.boolean().optional(),
  hiddenSidebarItems: z.array(z.enum(HIDEABLE_SIDEBAR_ITEM_IDS)).optional(),
  // Routing settings (#134)
  fallbackStrategy: z
    .enum(["fill-first", "round-robin", "p2c", "random", "least-used", "cost-optimized"])
    .optional(),
  wildcardAliases: z.array(z.object({ pattern: z.string(), target: z.string() })).optional(),
  stickyRoundRobinLimit: z.number().int().min(0).max(1000).optional(),
  // Auto intent classifier settings (multilingual routing)
  intentDetectionEnabled: z.boolean().optional(),
  intentSimpleMaxWords: z.number().int().min(1).max(500).optional(),
  intentExtraCodeKeywords: z.array(z.string().max(100)).optional(),
  intentExtraReasoningKeywords: z.array(z.string().max(100)).optional(),
  intentExtraSimpleKeywords: z.array(z.string().max(100)).optional(),
  // Protocol toggles (default: disabled)
  mcpEnabled: z.boolean().optional(),
  mcpTransport: z.enum(["stdio", "sse", "streamable-http"]).optional(),
  a2aEnabled: z.boolean().optional(),
  // CLI Fingerprint compatibility (per-provider)
  cliCompatProviders: z.array(z.string().max(100)).optional(),
  // Strip provider/model prefix at proxy layer (e.g. "openai/gpt-4" → "gpt-4")
  stripModelPrefix: z.boolean().optional(),
  // Cache control preservation mode
  alwaysPreserveClientCache: z.enum(["auto", "always", "never"]).optional(),
  // Adaptive Volume Routing
  adaptiveVolumeRouting: z.boolean().optional(),
  // Usage token buffer — safety margin added to reported prompt/input token counts.
  // Prevents CLI tools from overrunning context windows. Set to 0 to disable.
  usageTokenBuffer: z.number().int().min(0).max(50000).optional(),
  // Custom CLI agent definitions for ACP
  customAgents: z
    .array(
      z.object({
        id: z.string().max(50),
        name: z.string().max(100),
        binary: z.string().max(200),
        versionCommand: z.string().max(300),
        providerAlias: z.string().max(50),
        spawnArgs: z.array(z.string().max(200)),
        protocol: z.enum(["stdio", "http"]),
      })
    )
    .optional(),
  // SkillsMP marketplace API key
  skillsmpApiKey: z.string().max(200).optional(),
  // models.dev sync settings
  modelsDevSyncEnabled: z.boolean().optional(),
  modelsDevSyncInterval: z.number().int().min(1000).max(604800000).optional(),
  /** After a combo exhausts all models, retry once with this model if response status matches. */
  globalFallbackModel: z.string().max(500).nullable().optional(),
  /** HTTP statuses that trigger global fallback (default: 502, 503). Add 429/504 to opt in. */
  globalFallbackStatusCodes: z.array(z.number().int().min(100).max(599)).max(20).optional(),
  // Background degradation config (stored as structured object, not JSON string)
  backgroundDegradation: z.unknown().optional(),
  // LKGP (Least Known Good Provider) toggle
  lkgpEnabled: z.boolean().optional(),
  // Model-level reasoning defaults (e.g. { "github/gpt-5.3-codex": "high" })
  modelReasoningDefaults: z.record(z.string().max(300), z.string().max(20)).optional(),
  /** Oversized request handling before upstream (Dashboard → AI) */
  contextValidation: z.enum(["passthrough", "auto-compress"]).optional(),
  /**
   * Output-side caveman: injects a terseness directive into the system prompt so the model
   * replies with fewer output tokens. Default "off" — opt-in per user.
   */
  cavemanOutputLevel: z.enum(["off", "lite", "full"]).optional(),
  /**
   * Request deduplication config (plan 260531-1214-request-dedupe).
   * Generic, opt-out chokepoint that prevents duplicate concurrent requests
   * (from buggy clients/gateways) from costing tokens twice at the proxy.
   */
  dedupeConfig: z
    .object({
      enabled: z.boolean().optional(),
      mode: z.enum(["off", "shadow", "enforce"]).optional(),
      ttlMs: z.number().int().min(500).max(5000).optional(),
      maxTemperatureForDedup: z.number().min(0).max(2).optional(),
    })
    .optional(),
});
