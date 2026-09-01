import { NextResponse } from "next/server";
import {
  getProviderConnections,
  createProviderConnection,
  updateProviderConnection,
  getProviderNodeById,
  isCloudEnabled,
} from "@/models";
import { APIKEY_PROVIDERS } from "@/shared/constants/config";
import {
  isClaudeCodeCompatibleProvider,
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
} from "@/shared/constants/providers";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { getConnectionUsageHealth } from "@/lib/db/connectionUsageHealth";
import { syncToCloud } from "@/lib/cloudSync";
import {
  getAuditActorFromRequest,
  getAuditIpFromRequest,
  logAuditEvent,
} from "@/lib/compliance/index";
import { createProviderSchema } from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { normalizeQoderPatProviderData } from "@routiform/open-sse/services/qoderCli.ts";
import { supportsProviderModelAutoSync } from "@/shared/utils/providerAutoSync";
import { GITHUB_CONFIG } from "@/lib/oauth/constants/oauth";

async function backfillGithubUserInfo(connection: Record<string, unknown>) {
  const accessToken = connection.accessToken as string | undefined;
  if (!accessToken) return connection;

  const psd =
    connection.providerSpecificData &&
    typeof connection.providerSpecificData === "object" &&
    !Array.isArray(connection.providerSpecificData)
      ? (connection.providerSpecificData as Record<string, unknown>)
      : {};

  try {
    const userRes = await fetch(GITHUB_CONFIG.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "X-GitHub-Api-Version": GITHUB_CONFIG.apiVersion,
        "User-Agent": GITHUB_CONFIG.userAgent,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!userRes.ok) return connection;

    const userInfo = await userRes.json();
    const githubLogin = userInfo.login as string | undefined;
    const githubName = userInfo.name as string | undefined;
    const githubEmail = userInfo.email as string | undefined;

    if (!githubLogin && !githubName) return connection;

    const updatedPsd = {
      ...psd,
      githubUserId: userInfo.id,
      githubLogin,
      githubName,
      githubEmail,
    };

    await updateProviderConnection(connection.id as string, {
      name: githubLogin || githubName,
      email: githubEmail || null,
      displayName: githubName || githubLogin,
      providerSpecificData: updatedPsd,
    });

    return {
      ...connection,
      name: githubLogin || githubName,
      email: githubEmail || null,
      displayName: githubName || githubLogin,
      providerSpecificData: updatedPsd,
    };
  } catch {
    return connection;
  }
}

/**
 * The stored credentials are never returned to the client, so the duplicate check has to happen
 * here rather than in the dashboard: only the server can compare a pasted value against what is
 * already on disk without exposing the values it is comparing against.
 */
async function findConnectionWithSameCredential(
  provider: string,
  apiKey: unknown,
  accessToken: unknown
): Promise<{ name: string | null } | null> {
  const incoming = [apiKey, accessToken]
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
  if (incoming.length === 0) return null;

  const existing = await getProviderConnections({ provider });
  for (const connection of existing as Record<string, unknown>[]) {
    const stored = [connection.apiKey, connection.accessToken]
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim());
    if (stored.some((value) => value && incoming.includes(value))) {
      return { name: typeof connection.name === "string" ? connection.name : null };
    }
  }
  return null;
}

// GET /api/providers - List all connections
export async function GET() {
  try {
    const connections = await getProviderConnections();

    const backfilled = await Promise.all(
      connections.map(async (c) => {
        if (
          c.provider === "github" &&
          c.authType === "oauth" &&
          !(c as Record<string, unknown>).name
        ) {
          return backfillGithubUserInfo(c as Record<string, unknown>);
        }
        return c;
      })
    );

    // `testStatus` only moves when someone runs an explicit connection test, so it says
    // nothing about whether the connection still works — it can read "active" from a test
    // months ago while every real request returns 400. Recent request outcomes do say,
    // and combo templates use them to skip a connection that is failing everything.
    const usageHealth = getConnectionUsageHealth();

    // Hide sensitive fields (expose only whether any secret exists — for dashboard hints)
    const safeConnections = backfilled.map((c) => {
      const connection = c as Record<string, unknown>;
      const health = usageHealth[String(connection.id ?? "")];
      const psd = connection.providerSpecificData as Record<string, unknown> | undefined;
      return {
        ...connection,
        apiKey: undefined,
        accessToken: undefined,
        refreshToken: undefined,
        idToken: undefined,
        // Account-scoped secret (Ollama session cookie): never echo to the
        // dashboard. PUT merge preserves keys a client did not send.
        providerSpecificData: psd
          ? { ...psd, ...(psd.settingsCookie !== undefined ? { settingsCookie: undefined } : {}) }
          : psd,
        credentialsConfigured: Boolean(
          connection.apiKey || connection.accessToken || connection.refreshToken
        ),
        // Absent when the connection served no request in the window: "never used" and
        // "used and failed" are different states and must stay distinguishable.
        recentAttempts: health?.attempts,
        recentSuccesses: health?.successes,
      };
    });

    return NextResponse.json({ connections: safeConnections });
  } catch (error) {
    console.log("Error fetching providers:", error);
    return NextResponse.json({ error: "Failed to fetch providers" }, { status: 500 });
  }
}

// POST /api/providers - Create new connection (API Key only, OAuth via separate flow)
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Zod validation
    const validation = validateBody(createProviderSchema, body);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const {
      provider,
      apiKey,
      accessToken,
      authType,
      name,
      priority,
      globalPriority,
      defaultModel,
      testStatus,
      providerSpecificData: incomingPsd,
    } = validation.data;

    // Business validation
    const isValidProvider =
      APIKEY_PROVIDERS[provider] ||
      provider === "qoder" ||
      isOpenAICompatibleProvider(provider) ||
      isAnthropicCompatibleProvider(provider);

    if (!isValidProvider) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    // Same credential, already stored for this provider. Without this the second copy becomes a
    // second connection under a different name, and the rotation pool silently double-counts one
    // upstream quota. Reported distinctly so a bulk paste can call it "skipped", not "failed".
    const duplicate = await findConnectionWithSameCredential(provider, apiKey, accessToken);
    if (duplicate) {
      return NextResponse.json(
        {
          error: {
            code: "duplicate_credential",
            message: `This credential is already stored for ${provider}${
              duplicate.name ? ` as "${duplicate.name}"` : ""
            }`,
          },
        },
        { status: 409 }
      );
    }

    let providerSpecificData = incomingPsd || null;
    const allowMultipleCompatibleConnections =
      process.env.ALLOW_MULTI_CONNECTIONS_PER_COMPAT_NODE === "true";

    if (provider === "qoder") {
      providerSpecificData = normalizeQoderPatProviderData(providerSpecificData || {});
    }

    if (isOpenAICompatibleProvider(provider)) {
      const node: Record<string, unknown> = await getProviderNodeById(provider);
      if (!node) {
        return NextResponse.json({ error: "OpenAI Compatible node not found" }, { status: 404 });
      }

      const existingConnections = await getProviderConnections({ provider });
      if (!allowMultipleCompatibleConnections && existingConnections.length > 0) {
        return NextResponse.json(
          { error: "Only one connection is allowed for this OpenAI Compatible node" },
          { status: 400 }
        );
      }

      providerSpecificData = {
        ...(providerSpecificData || {}),
        prefix: node.prefix,
        apiType: node.apiType,
        baseUrl: node.baseUrl,
        nodeName: node.name,
        ...(node.chatPath ? { chatPath: node.chatPath } : {}),
        ...(node.modelsPath ? { modelsPath: node.modelsPath } : {}),
      };
    } else if (isAnthropicCompatibleProvider(provider)) {
      const node: Record<string, unknown> = await getProviderNodeById(provider);
      if (!node) {
        return NextResponse.json(
          {
            error: isClaudeCodeCompatibleProvider(provider)
              ? "CC Compatible node not found"
              : "Anthropic Compatible node not found",
          },
          { status: 404 }
        );
      }

      const existingConnections = await getProviderConnections({ provider });
      if (!allowMultipleCompatibleConnections && existingConnections.length > 0) {
        return NextResponse.json(
          { error: "Only one connection is allowed for this Anthropic Compatible node" },
          { status: 400 }
        );
      }

      providerSpecificData = {
        ...(providerSpecificData || {}),
        prefix: node.prefix,
        baseUrl: node.baseUrl,
        nodeName: node.name,
        ...(node.chatPath ? { chatPath: node.chatPath } : {}),
        ...(node.modelsPath ? { modelsPath: node.modelsPath } : {}),
      };
    }

    const psd =
      providerSpecificData && typeof providerSpecificData === "object"
        ? (providerSpecificData as Record<string, unknown>)
        : {};
    providerSpecificData = {
      ...psd,
      autoSync:
        psd.autoSync === false ? false : supportsProviderModelAutoSync(provider) ? true : false,
    };

    const newConnection = await createProviderConnection({
      provider,
      authType: authType || "apikey",
      name,
      apiKey: apiKey || null,
      accessToken: accessToken || null,
      priority: priority || 1,
      globalPriority: globalPriority || null,
      defaultModel: defaultModel || null,
      providerSpecificData,
      isActive: true,
      testStatus: testStatus || "unknown",
    });

    logAuditEvent({
      action: "provider.connection.create",
      actor: await getAuditActorFromRequest(request),
      target: String((newConnection as Record<string, unknown>).id || provider),
      details: {
        provider,
        authType: authType || "apikey",
        name,
        isActive: true,
      },
      ipAddress: getAuditIpFromRequest(request),
    });

    // Note: Gemini model sync is now triggered client-side with progress dialog

    // Hide sensitive fields
    const result: Record<string, unknown> = { ...newConnection };
    delete result.apiKey;
    delete result.accessToken;

    // Auto sync to Cloud if enabled
    await syncToCloudIfEnabled();

    return NextResponse.json({ connection: result }, { status: 201 });
  } catch (error) {
    console.log("Error creating provider:", error);
    return NextResponse.json({ error: "Failed to create provider" }, { status: 500 });
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
    console.log("Error syncing providers to cloud:", error);
  }
}
