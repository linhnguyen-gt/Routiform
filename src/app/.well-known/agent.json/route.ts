/**
 * Agent Card Endpoint — /.well-known/agent.json
 *
 * Serves the Routiform A2A Agent Card for discovery by other agents.
 * Conforms to A2A Protocol v0.3.
 *
 * The Agent Card is dynamically generated to include the current version
 * from package.json and skills based on available combos.
 */

import { NextResponse } from "next/server";

const PACKAGE_VERSION = process.env.npm_package_version || "1.8.1";
const BASE_URL =
  process.env.ROUTIFORM_BASE_URL || process.env.OMNIROUTE_BASE_URL || "http://localhost:20128";

/**
 * GET /.well-known/agent.json
 *
 * Returns the Routiform Agent Card that describes this gateway's
 * capabilities as an A2A agent.
 */
export async function GET() {
  const agentCard = {
    name: "Routiform AI Gateway",
    description:
      "Intelligent AI routing gateway with 36+ providers, smart fallback, " +
      "quota tracking, format translation, and auto-managed combos. " +
      "Routes AI requests to the optimal provider based on cost, latency, " +
      "quota availability, and task requirements.",
    url: `${BASE_URL}/a2a`,
    version: PACKAGE_VERSION,
    capabilities: {
      streaming: true,
      pushNotifications: false,
    },
    skills: [
      {
        id: "smart-routing",
        name: "Smart Request Routing",
        description:
          "Routes AI requests to the optimal provider based on quota, cost, " +
          "latency, and reliability. Supports combo-based routing with " +
          "multiple strategies: priority, weighted, round-robin, cost-optimized.",
        tags: ["routing", "llm", "optimization", "fallback"],
        examples: [
          "Route this coding task to the fastest available model",
          "Send this review to an analytical model under $0.50 budget",
          "Find the cheapest provider with available quota",
        ],
      },
      {
        id: "quota-management",
        name: "Quota & Cost Management",
        description:
          "Tracks and manages API quotas across 36+ providers with " +
          "auto-fallback when quotas are exhausted. Provides real-time " +
          "cost tracking and budget enforcement.",
        tags: ["quota", "cost", "monitoring", "budget"],
        examples: [
          "Check remaining quota for all providers",
          "Which provider has the most available quota?",
          "Generate a cost report for today",
        ],
      },
      {
        id: "auto-combo",
        name: "Auto-Managed Model Combos",
        description:
          "Self-healing model chains that dynamically adapt to provider " +
          "health and quota availability. Uses a scoring function based on " +
          "quota, health, cost, latency, task fitness, and stability.",
        tags: ["combo", "auto", "self-healing", "adaptive"],
        examples: [
          "Create an auto-managed combo for coding tasks",
          "Switch to cost-saver mode",
          "Show the Auto-Combo scoring breakdown",
        ],
      },
      {
        id: "format-translation",
        name: "Format Translation",
        description:
          "Transparently translates between OpenAI, Claude (Anthropic), " +
          "Gemini (Google), and Responses API formats. Supports streaming " +
          "translation for all format pairs.",
        tags: ["translation", "openai", "claude", "gemini", "responses"],
        examples: [
          "Send an OpenAI-format request to Claude",
          "Translate this Gemini response to OpenAI format",
        ],
      },
    ],
    authentication: {
      schemes: ["api-key"],
      apiKeyHeader: "Authorization",
    },
  };

  return NextResponse.json(agentCard, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/json",
    },
  });
}
