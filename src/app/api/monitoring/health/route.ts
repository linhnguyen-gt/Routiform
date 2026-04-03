import { NextResponse } from "next/server";
import { getProviderConnections, getSettings } from "@/lib/localDb";
import { APP_CONFIG } from "@/shared/constants/config";
import { AI_PROVIDERS } from "@/shared/constants/providers";

/**
 * GET /api/monitoring/health — System health overview
 *
 * Returns system info, provider health (circuit breakers),
 * rate limit status, and database stats.
 */
export async function GET() {
  try {
    const { getAllCircuitBreakerStatuses } = await import("@/shared/utils/circuitBreaker");
    const { getAllRateLimitStatus } = await import("@omniroute/open-sse/services/rateLimitManager");
    const { getAllModelLockouts } = await import("@omniroute/open-sse/services/accountFallback");
    const { getInflightCount } = await import("@omniroute/open-sse/services/requestDedup.ts");

    const settings = await getSettings();
    const connections = await getProviderConnections();
    const circuitBreakers = getAllCircuitBreakerStatuses();
    const rateLimitStatus = getAllRateLimitStatus();
    const lockouts = getAllModelLockouts();
    const { getAllHealthStatuses } = await import("@/lib/localHealthCheck");

    // System info
    const system = {
      version: APP_CONFIG.version,
      nodeVersion: process.version,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      pid: process.pid,
      platform: process.platform,
    };

    // Provider health summary (circuitBreakers is an Array of { name, state, ... })
    const providerHealth = {};
    for (const cb of circuitBreakers) {
      // Skip test circuit breakers (leftover from unit tests)
      if (cb.name.startsWith("test-") || cb.name.startsWith("test_")) continue;
      providerHealth[cb.name] = {
        state: cb.state,
        failures: cb.failureCount || 0,
        lastFailure: cb.lastFailureTime,
      };
    }

    const configuredProviders = new Set(connections.map((c: any) => c.provider));
    const activeProviders = new Set(
      connections.filter((c: any) => c.isActive !== false).map((c: any) => c.provider)
    );

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      system,
      providerHealth,
      providerSummary: {
        catalogCount: Object.keys(AI_PROVIDERS).length,
        configuredCount: configuredProviders.size,
        activeCount: activeProviders.size,
        monitoredCount: Object.keys(providerHealth).length,
      },
      localProviders: getAllHealthStatuses(),
      rateLimitStatus,
      lockouts,
      dedup: {
        inflightRequests: getInflightCount(),
      },
      cryptography: {
        status:
          process.env.STORAGE_ENCRYPTION_KEY && process.env.STORAGE_ENCRYPTION_KEY.length >= 32
            ? "healthy"
            : "missing_or_invalid",
        provider: "aes-256-gcm",
      },
      setupComplete: settings?.setupComplete || false,
    });
  } catch (error) {
    console.error("[API] GET /api/monitoring/health error:", error);
    return NextResponse.json({ status: "error", error: "Health check failed" }, { status: 500 });
  }
}

/**
 * DELETE /api/monitoring/health — Reset all circuit breakers
 *
 * Resets all provider circuit breakers to CLOSED state,
 * clearing failure counts and persisted state.
 */
export async function DELETE() {
  try {
    const { resetAllCircuitBreakers, getAllCircuitBreakerStatuses } =
      await import("@/shared/utils/circuitBreaker");

    const before = getAllCircuitBreakerStatuses();
    const resetCount = before.length;

    resetAllCircuitBreakers();

    console.log(`[API] DELETE /api/monitoring/health — Reset ${resetCount} circuit breakers`);

    return NextResponse.json({
      success: true,
      message: `Reset ${resetCount} circuit breaker(s) to healthy state`,
      resetCount,
    });
  } catch (error) {
    console.error("[API] DELETE /api/monitoring/health error:", error);
    return NextResponse.json({ error: "Failed to reset circuit breakers" }, { status: 500 });
  }
}
