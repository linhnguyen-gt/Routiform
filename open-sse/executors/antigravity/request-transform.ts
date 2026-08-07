/**
 * Request transformation for the Antigravity (Cloud Code) upstream.
 *
 * Resolves the project, applies the content fixups from ./request-content.ts,
 * and rebuilds the Cloud Code envelope.
 *
 * @module executors/antigravity/request-transform
 */
import crypto, { randomUUID } from "crypto";
import { resolveAntigravityProject } from "./project-resolver.ts";
import { normalizeContents, obfuscateContents, sanitizeToolSchemas } from "./request-content.ts";
import type {
  AntigravityCredentials,
  AntigravityInnerRequest,
  AntigravityLog,
  AntigravityRequestBody,
} from "./types.ts";

/**
 * Strip provider prefixes (e.g. "antigravity/model" → "model").
 * Ensures the model name sent to the upstream API never contains a routing prefix.
 *
 * NOTE: We intentionally do NOT rewrite tier suffixes here. Earlier revisions
 * silently downcast bare/agent IDs to the "-low" tier, which made the test/Health
 * UI hit exhausted quotas while production traffic (which already sends explicit
 * tiers) worked. Source of truth for valid model IDs is the upstream
 * `v1internal:fetchAvailableModels` response — see
 * `src/lib/providers/antigravityLiveModels.ts`. If a bare ID reaches the upstream
 * and it rejects with 400, surface that to the caller instead of remapping it.
 */
export function cleanModelName(model: string): string {
  if (!model) return model;
  return model.includes("/") ? model.split("/").pop()! : model;
}

export function generateAntigravitySessionId(): string {
  return `-${parseInt(randomUUID().replace(/-/g, "").substring(0, 8), 16) % 9_000_000_000_000_000_000}`;
}

/**
 * (#489) Structured 422 instead of a throw — gives the client a clear signal to
 * show a "Reconnect OAuth" prompt rather than an opaque "Internal Server Error".
 * Fires only after runtime loadCodeAssist + onboardUser also fail (e.g. revoked
 * scopes, network outage, or upstream 5xx).
 */
function buildMissingProjectResponse(): Response {
  const errorBody = {
    error: {
      message:
        "Could not resolve a Google Cloud Code project for this Antigravity account. Try reconnecting OAuth in Providers → Antigravity, or retry — onboarding may still be propagating.",
      type: "oauth_missing_project_id",
      code: "missing_project_id",
    },
  };
  return new Response(JSON.stringify(errorBody), {
    status: 422,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Prefer the OAuth-stored projectId over incoming body.project so stale
 * client-side values cannot cause 404/403 from Cloud Code endpoints. Opt-in
 * escape hatch: ROUTIFORM_ALLOW_BODY_PROJECT_OVERRIDE=1.
 *
 * When nothing usable is stored, fall back to a runtime Cloud Code lookup
 * (loadCodeAssist + onboardUser) — this
 * turns "Missing projectId" 422s into auto-recovery without an OAuth reconnect.
 */
async function resolveProjectId(
  body: AntigravityRequestBody,
  credentials: AntigravityCredentials,
  log?: AntigravityLog
): Promise<string | undefined> {
  const bodyProjectId = body?.project;
  const credentialsProjectId = credentials?.projectId;
  const allowBodyProjectOverride = process.env.ROUTIFORM_ALLOW_BODY_PROJECT_OVERRIDE === "1";

  let projectId =
    allowBodyProjectOverride && bodyProjectId
      ? bodyProjectId
      : credentialsProjectId || bodyProjectId;

  if (
    (!projectId || (typeof projectId === "string" && !projectId.trim())) &&
    credentials?.accessToken
  ) {
    const resolved = await resolveAntigravityProject(credentials.accessToken, log);
    if (resolved) projectId = resolved;
  }

  return projectId;
}

/**
 * Build the upstream Cloud Code envelope.
 * Returns a `Response` (422) when no project could be resolved — the executor
 * forwards it to the client untouched.
 */
export async function buildAntigravityRequest(
  model: string,
  body: AntigravityRequestBody,
  credentials: AntigravityCredentials,
  log?: AntigravityLog
): Promise<Record<string, unknown> | Response> {
  const projectId = await resolveProjectId(body, credentials, log);
  if (!projectId) return buildMissingProjectResponse();

  const contents = normalizeContents(body.request?.contents);

  const transformedRequest: AntigravityInnerRequest = {
    ...body.request,
    ...(contents.length > 0 && { contents }),
    sessionId: body.request?.sessionId || generateAntigravitySessionId(),
    safetySettings: undefined,
    toolConfig:
      (body.request?.tools?.length ?? 0) > 0
        ? { functionCallingConfig: { mode: "VALIDATED" } }
        : body.request?.toolConfig,
  };

  sanitizeToolSchemas(transformedRequest.tools);
  obfuscateContents(transformedRequest.contents);

  const {
    project: _project,
    model: _model,
    userAgent: _userAgent,
    requestType: _requestType,
    requestId: _requestId,
    request: _request,
    ...passthroughFields
  } = body;

  return {
    project: projectId,
    model: cleanModelName(model),
    userAgent: "antigravity",
    requestType: "agent",
    requestId: `agent-${crypto.randomUUID()}`,
    request: transformedRequest,
    ...passthroughFields,
  };
}
