import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";
import { clearHealthCheckLogCache } from "@/lib/tokenHealthCheck";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";
import { getRuntimePorts } from "@/lib/runtime/ports";
import { updateSettingsSchema } from "@/shared/validation/settingsSchemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { setCliCompatProviders } from "../../../../open-sse/config/cliFingerprints";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { validateProxyUrl, upsertUpstreamProxyConfig } from "@/lib/db/upstreamProxy";

export async function GET() {
  try {
    const settings = await getSettings();
    const { password, ...safeSettings } = settings;

    // Sync CLI fingerprint providers to runtime cache on load
    if (settings.cliCompatProviders) {
      setCliCompatProviders(settings.cliCompatProviders as string[]);
    }

    const runtimePorts = getRuntimePorts();
    const cloudUrl = process.env.CLOUD_URL || process.env.NEXT_PUBLIC_CLOUD_URL || null;
    const machineId = await getConsistentMachineId();

    return NextResponse.json({
      ...safeSettings,
      hasPassword: !!password || !!process.env.INITIAL_PASSWORD,
      runtimePorts,
      apiPort: runtimePorts.apiPort,
      dashboardPort: runtimePorts.dashboardPort,
      cloudConfigured: Boolean(cloudUrl),
      cloudUrl,
      machineId,
    });
  } catch (error) {
    console.log("Error getting settings:", error);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const rawBody = await request.json();

    // Zod validation
    const validation = validateBody(updateSettingsSchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const body: typeof validation.data & { password?: string } = { ...validation.data };

    // If updating password, hash it
    if (body.newPassword) {
      const settings = await getSettings();
      const currentHash = typeof settings.password === "string" ? settings.password : "";

      // Verify current password if it exists
      if (currentHash) {
        if (!body.currentPassword) {
          return NextResponse.json({ error: "Current password required" }, { status: 400 });
        }
        const isValid = await bcrypt.compare(body.currentPassword, currentHash);
        if (!isValid) {
          return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
        }
      } else {
        // First-time password set (no DB hash yet).
        const LEGACY_DEFAULT_PASSWORD = "123456";
        const initialPassword = process.env.INITIAL_PASSWORD;
        const currentPassword = body.currentPassword || "";

        if (initialPassword) {
          // If deploy is configured with INITIAL_PASSWORD, require explicit match.
          if (!currentPassword) {
            return NextResponse.json({ error: "Current password required" }, { status: 400 });
          }

          const providedBuffer = Buffer.from(currentPassword, "utf8");
          const expectedBuffer = Buffer.from(initialPassword, "utf8");
          const isValidInitialPassword =
            providedBuffer.length === expectedBuffer.length &&
            timingSafeEqual(providedBuffer, expectedBuffer);

          if (!isValidInitialPassword) {
            return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
          }
        } else {
          // Legacy compatibility: instances without INITIAL_PASSWORD may still use old default.
          const allowedWithoutHash = ["", LEGACY_DEFAULT_PASSWORD];
          if (!allowedWithoutHash.includes(currentPassword)) {
            return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
          }
        }
      }

      const salt = await bcrypt.genSalt(10);
      body.password = await bcrypt.hash(body.newPassword, salt);
      delete body.newPassword;
      delete body.currentPassword;
    }

    const settings = await updateSettings(body);

    // Sync CLIProxyAPI settings to upstream_proxy_config table
    const cpaUrl = rawBody.cliproxyapi_url as string | undefined;
    const cpaFallback = rawBody.cliproxyapi_fallback_enabled as boolean | undefined;
    if (cpaUrl && typeof cpaUrl === "string") {
      const urlValidation = validateProxyUrl(cpaUrl);
      if (urlValidation.valid === false) {
        return NextResponse.json(
          { error: `Invalid CLIProxyAPI URL: ${urlValidation.error}` },
          { status: 400 }
        );
      }
    }
    if (cpaFallback !== undefined || cpaUrl !== undefined) {
      const enabled =
        cpaFallback ?? (settings as Record<string, unknown>).cliproxyapi_fallback_enabled;
      const mode = enabled ? "fallback" : "native";
      await upsertUpstreamProxyConfig({
        providerId: "cliproxyapi",
        mode,
        enabled: !!enabled,
      });
    }

    // Clear health check log cache if that setting was updated
    if ("hideHealthCheckLogs" in body) {
      clearHealthCheckLogCache();
    }

    // Sync CLI fingerprint providers to runtime cache
    if ("cliCompatProviders" in body) {
      setCliCompatProviders(body.cliCompatProviders || []);
    }

    // Sync cache control settings to runtime cache
    if ("alwaysPreserveClientCache" in body) {
      const { invalidateCacheControlSettingsCache } = await import("@/lib/cacheControlSettings");
      invalidateCacheControlSettingsCache();
    }

    const { password, ...safeSettings } = settings;
    return NextResponse.json(safeSettings);
  } catch (error) {
    console.log("Error updating settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
