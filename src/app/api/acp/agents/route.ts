import { NextResponse } from "next/server";
import {
  detectInstalledAgents,
  refreshAgentCache,
  setCustomAgents,
  type CustomAgentDef,
} from "@/lib/acp/registry";
import { getSettings, updateSettings } from "@/lib/localDb";
import { acpAgentRequestSchema } from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { isHostSecretAuthenticated } from "@/shared/utils/apiAuth";

/**
 * Writing a custom agent stores a binary and a version command that this host then executes on
 * every cache refresh. That is a host-capability grant, not ordinary configuration, so a gateway
 * API key issued to an inference client does not open it.
 */
const FORBIDDEN = NextResponse.json({ error: "Unauthorized" }, { status: 401 });

// Listing runs detection, and detection executes every stored versionCommand — so a read here is
// still a host-capability use. If a genuinely public agent list is ever needed, split detection out
// rather than reopening this guard.
export async function GET(request: Request) {
  if (!(await isHostSecretAuthenticated(request))) return FORBIDDEN;

  try {
    // Load custom agents from settings on each GET to stay in sync
    const settings = await getSettings();
    if (settings.customAgents) {
      setCustomAgents(settings.customAgents as CustomAgentDef[]);
    }

    const agents = detectInstalledAgents();
    const installed = agents.filter((a) => a.installed).length;
    const total = agents.length;

    return NextResponse.json({
      agents,
      summary: {
        total,
        installed,
        notFound: total - installed,
        builtIn: agents.filter((a) => !a.isCustom).length,
        custom: agents.filter((a) => a.isCustom).length,
      },
    });
  } catch (error) {
    console.error("Error detecting agents:", error);
    return NextResponse.json({ error: "Failed to detect agents" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isHostSecretAuthenticated(request))) return FORBIDDEN;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // The schema carries the agent shape and the versionCommand rule (which reuses the same
  // tokenizer the executor uses), so a command that cannot be tokenized is a 400 here rather than
  // an agent that permanently reads as "not installed" later.
  const validation = validateBody(acpAgentRequestSchema, rawBody);
  if (isValidationFailure(validation)) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const body = validation.data;

    if ("action" in body && body.action === "refresh") {
      const agents = refreshAgentCache();
      return NextResponse.json({ agents, refreshed: true });
    }

    const { id, name, binary, versionCommand, providerAlias, spawnArgs, protocol } =
      body as Extract<typeof body, { id: string }>;

    const newAgent: CustomAgentDef = {
      id: id.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      name,
      binary,
      versionCommand,
      providerAlias: providerAlias || id,
      spawnArgs: spawnArgs ?? [],
      protocol: protocol ?? "stdio",
    };

    // Load current, append, save
    const settings = await getSettings();
    const current: CustomAgentDef[] = (settings.customAgents as CustomAgentDef[]) || [];

    // Avoid duplicates
    if (current.some((a) => a.id === newAgent.id)) {
      return NextResponse.json(
        { error: `Agent with id '${newAgent.id}' already exists` },
        { status: 409 }
      );
    }

    const updated = [...current, newAgent];
    await updateSettings({ customAgents: updated });
    setCustomAgents(updated);

    // Refresh cache to detect the new agent
    const agents = refreshAgentCache();
    return NextResponse.json({ agents, added: newAgent });
  } catch (error) {
    console.error("Error adding custom agent:", error);
    return NextResponse.json({ error: "Failed to add agent" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isHostSecretAuthenticated(request))) return FORBIDDEN;

  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("id");

    if (!agentId) {
      return NextResponse.json({ error: "Missing agent id" }, { status: 400 });
    }

    const settings = await getSettings();
    const current: CustomAgentDef[] = (settings.customAgents as CustomAgentDef[]) || [];
    const updated = current.filter((a) => a.id !== agentId);

    if (updated.length === current.length) {
      return NextResponse.json(
        { error: `Agent '${agentId}' not found in custom agents` },
        { status: 404 }
      );
    }

    await updateSettings({ customAgents: updated });
    setCustomAgents(updated);
    const agents = refreshAgentCache();

    return NextResponse.json({ agents, removed: agentId });
  } catch (error) {
    console.error("Error removing custom agent:", error);
    return NextResponse.json({ error: "Failed to remove agent" }, { status: 500 });
  }
}
