import { CORS_ORIGIN } from "@/shared/utils/cors";
import { buildClientRawRequest, handleChat } from "@/sse/handlers/chat";
import { initTranslators } from "@routiform/open-sse/translator/index.ts";
import { errorResponse } from "@routiform/open-sse/utils/error.ts";
import { HTTP_STATUS } from "@routiform/open-sse/config/constants.ts";
import { getRegistryEntry } from "@routiform/open-sse/config/registry-lookup.ts";
import { providerChatCompletionSchema } from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { splitModelString } from "@/shared/models/model-string";
import { resolveProviderRef } from "@/shared/models/resolve-provider-ref";
import { getProviderNodes } from "@/lib/localDb";

let initialized = false;

/**
 * Prefixes of the provider-node types the router actually resolves.
 * `getModelInfo` checks exactly `openai-compatible` (src/sse/services/model.ts:51)
 * then `anthropic-compatible` (:67) — loading unfiltered would classify some
 * third node type as a node and 400 a ref the router would never resolve.
 */
async function loadNodePrefixes(): Promise<Set<string>> {
  const [openaiNodes, anthropicNodes] = await Promise.all([
    getProviderNodes({ type: "openai-compatible" }),
    getProviderNodes({ type: "anthropic-compatible" }),
  ]);

  const prefixes = new Set<string>();
  for (const node of [...openaiNodes, ...anthropicNodes]) {
    if (typeof node?.prefix === "string" && node.prefix) prefixes.add(node.prefix);
  }
  return prefixes;
}

async function ensureInitialized() {
  if (!initialized) {
    await initTranslators();
    initialized = true;
  }
}

/**
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": CORS_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

/**
 * POST /v1/providers/{provider}/chat/completions
 * Routes to the specified provider, validating model/provider match.
 */
export async function POST(request, { params }) {
  const { provider: rawProvider } = await params;

  const providerEntry = getRegistryEntry(rawProvider);

  if (!providerEntry) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, `Unknown provider: ${rawProvider}`);
  }

  // Resolve provider alias/id for model prefix checks
  const providerAlias = providerEntry.alias || providerEntry.id;

  await ensureInitialized();

  // Clone request with provider-prefixed model
  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }
  const validation = validateBody(providerChatCompletionSchema, rawBody);
  if (isValidationFailure(validation)) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, validation.error.message);
  }
  const body = validation.data;

  // Validate model belongs to this provider
  if (body.model) {
    const split = splitModelString(body.model);
    const acceptedPrefixes = [providerAlias, rawProvider, providerEntry.id];
    const hasProviderPrefix = !!split && acceptedPrefixes.includes(split.providerRef);

    if (!split) {
      // Bare model id, no slash at all — existing behavior.
      body.model = `${providerAlias}/${body.model}`;
    } else if (!hasProviderPrefix) {
      // The head is either a VENDOR prefix that belongs to the model id
      // ("meta/llama-3.3-70b-instruct") or a reference to a different
      // provider / a custom node. Only the former may be auto-prefixed.
      //
      // FAIL CLOSED. If the provider-node read fails we cannot tell a vendor
      // prefix ("meta/…") from a custom node prefix ("mynode/…"). Auto-prefixing
      // on that uncertainty would dispatch a node-addressed request to THIS
      // provider using its credentials. Rejecting is recoverable; misdispatch
      // is not.
      // NOTE: phase 06's validator makes the OPPOSITE choice on purpose — see
      // the fail-open comment there. Do not unify these.
      let nodePrefixes: Set<string> | null;
      try {
        nodePrefixes = await loadNodePrefixes();
      } catch {
        nodePrefixes = null;
      }

      const resolved =
        nodePrefixes === null
          ? ({ kind: "provider" } as const) // unknown state → treat as "known elsewhere" → reject
          : resolveProviderRef(split.providerRef, nodePrefixes);

      if (resolved.kind === "unknown") {
        body.model = `${providerAlias}/${body.model}`;
      } else {
        return errorResponse(
          HTTP_STATUS.BAD_REQUEST,
          `Model "${body.model}" does not belong to provider "${rawProvider}". Expected prefix: ${providerAlias}/`
        );
      }
    }
  }

  // Create a new request with the modified body
  const newRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(body),
  });

  const clientRawRequest = buildClientRawRequest(request, rawBody);
  return await handleChat(newRequest, clientRawRequest);
}
