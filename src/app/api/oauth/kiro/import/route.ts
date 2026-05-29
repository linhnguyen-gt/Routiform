import { syncToCloud } from "@/lib/cloudSync";
import { KiroService } from "@/lib/oauth/services/kiro";
import { createProviderConnection, isCloudEnabled, resolveProxyForProvider } from "@/models";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { kiroImportSchema } from "@/shared/validation/schemas";
import { runWithProxyContext } from "@routiform/open-sse/utils/proxyFetch.ts";
import { NextResponse } from "next/server";

/**
 * POST /api/oauth/kiro/import
 * Import and validate refresh token from Kiro IDE
 */
export async function POST(request: Request) {
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
    const validation = validateBody(kiroImportSchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { refreshToken } = validation.data;

    const kiroService = new KiroService();

    // Resolve proxy for this provider (provider-level → global → direct)
    const proxy = await resolveProxyForProvider("kiro");

    // Validate and refresh token (through proxy if configured)
    const tokenData = await runWithProxyContext(proxy, () =>
      kiroService.validateImportToken(refreshToken.trim())
    );

    // Extract email from JWT if available
    const email = kiroService.extractEmailFromJWT(tokenData.accessToken);

    // Save to database — include client credentials for IDC/Builder ID tokens
    const providerSpecificData: Record<string, unknown> = {
      authMethod: tokenData.authMethod || "imported",
      provider: "Imported",
    };

    // If IDC/Builder ID auth, store client credentials for future token refreshes
    if (tokenData.clientId && tokenData.clientSecret) {
      providerSpecificData.clientId = tokenData.clientId;
      providerSpecificData.clientSecret = tokenData.clientSecret;
      providerSpecificData.clientSecretExpiresAt = tokenData.clientSecretExpiresAt;
      providerSpecificData.region = tokenData.region || "us-east-1";
    }

    if (tokenData.profileArn) {
      providerSpecificData.profileArn = tokenData.profileArn;
    }

    const connection: Record<string, unknown> = await createProviderConnection({
      provider: "kiro",
      authType: "oauth",
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresAt: new Date(Date.now() + tokenData.expiresIn * 1000).toISOString(),
      email: email || null,
      providerSpecificData,
      testStatus: "active",
    });

    // Auto sync to Cloud if enabled
    await syncToCloudIfEnabled();

    return NextResponse.json({
      success: true,
      connection: {
        id: connection.id,
        provider: connection.provider,
        email: connection.email,
      },
    });
  } catch (error: unknown) {
    console.log("Kiro import token error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * Sync to Cloud if enabled
 */
async function syncToCloudIfEnabled() {
  try {
    const cloudEnabled = await isCloudEnabled();
    if (!cloudEnabled) return;

    const machineId = await getConsistentMachineId();
    await syncToCloud(machineId);
  } catch (error) {
    console.log("Error syncing to cloud after Kiro import:", error);
  }
}
