import { NextResponse } from "next/server";
import { createProviderConnection, isCloudEnabled, resolveProxyForProvider } from "@/models";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { syncToCloud } from "@/lib/cloudSync";
import { isPrivilegedAuthenticated } from "@/shared/utils/apiAuth";
import { runWithProxyContext } from "@routiform/open-sse/utils/proxyFetch.ts";
import { devinImportSchema } from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";

export async function POST(request: Request) {
  if (!(await isPrivilegedAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validateBody(devinImportSchema, rawBody);
  if (isValidationFailure(validation)) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { accessToken } = validation.data;

  try {
    const proxy = await resolveProxyForProvider("devin");

    const tokenValid = await runWithProxyContext(proxy, () => validateDevinToken(accessToken));

    if (!tokenValid.valid) {
      return NextResponse.json(
        {
          error:
            tokenValid.error ||
            "Invalid or expired token. Run `devin auth login` to re-authenticate.",
        },
        { status: 401 }
      );
    }

    const connection: Record<string, unknown> = await createProviderConnection({
      provider: "devin",
      authType: "oauth",
      accessToken,
      refreshToken: null,
      expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
      email: tokenValid.email || null,
      providerSpecificData: {
        authMethod: "imported",
        provider: "Imported from Devin CLI",
        cliVersion: tokenValid.cliVersion,
      },
      testStatus: "active",
    });

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
    console.log("Devin import token error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/oauth/devin/import
 * Get instructions for importing Devin token
 */
export async function GET() {
  return NextResponse.json({
    provider: "devin",
    method: "import_token",
    instructions: {
      steps: [
        "Install Devin CLI: curl -fsSL https://cli.devin.ai/install.sh | bash",
        "Authenticate: devin auth login",
        "Check status: devin auth status",
        "Token is stored in ~/.local/share/devin/ or ~/.config/devin/",
      ],
    },
    requiredFields: [
      {
        name: "accessToken",
        label: "Access Token",
        description: "From Devin CLI credentials (after running devin auth login)",
        type: "textarea",
      },
    ],
  });
}

async function validateDevinToken(token: string): Promise<{
  valid: boolean;
  error?: string;
  email?: string;
  cliVersion?: string;
}> {
  try {
    // Validate via Codeium's gRPC-web endpoint (the actual API server used by Devin CLI).
    // Returns 200 for valid tokens, 401/403 for invalid ones.
    const response = await fetch(
      "https://server.codeium.com/exa.language_server_pb.LanguageServerService/GetCompletions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/grpc-web+json",
        },
        body: "{}",
      }
    );

    if (response.status === 401 || response.status === 403) {
      return {
        valid: false,
        error: "Token is invalid or expired. Run `devin auth login` to re-authenticate.",
      };
    }

    return { valid: true };
  } catch (_error) {
    return { valid: true };
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
    console.log("Error syncing to cloud after Devin import:", error);
  }
}
