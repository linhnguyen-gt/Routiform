import { getUnsupportedParams } from "../../config/registry-params.ts";
import { getProviderMaxTokensCap } from "../../config/constants.ts";
import { optimizeGithubRequestBody } from "../../utils/githubRequestOptimizer.ts";
import type { HandlerLogger, JsonRecord, ToolNameMap } from "../types/chat-core.ts";
import { buildClaudePassthroughToolNameMap } from "../utils/claude-passthrough-helpers.ts";
import { downgradeReasoningEffort } from "./chat-core-reasoning-effort-support.ts";

export function extractToolNameMapAndTuneTranslatedBody({
  translatedBody,
  body,
  isClaudePassthrough,
  effectiveModel,
  provider,
  model,
  log,
}: {
  translatedBody: JsonRecord;
  body: JsonRecord;
  isClaudePassthrough: boolean;
  effectiveModel: string;
  provider: string;
  model: string;
  log: HandlerLogger | null | undefined;
}): ToolNameMap {
  const translatedToolNameMap = translatedBody._toolNameMap;
  const nativeClaudeToolNameMap = isClaudePassthrough
    ? buildClaudePassthroughToolNameMap(body)
    : null;
  const toolNameMap =
    translatedToolNameMap instanceof Map && translatedToolNameMap.size > 0
      ? translatedToolNameMap
      : nativeClaudeToolNameMap;
  delete translatedBody._toolNameMap;
  delete translatedBody._disableToolPrefix;

  translatedBody.model = effectiveModel;

  const unsupported = getUnsupportedParams(provider, model);
  if (unsupported.length > 0) {
    const stripped: string[] = [];
    for (const param of unsupported) {
      if (Object.hasOwn(translatedBody, param)) {
        stripped.push(param);
        delete translatedBody[param];
      }
    }
    if (stripped.length > 0) {
      log?.warn?.("PARAMS", `Stripped unsupported params for ${model}: ${stripped.join(", ")}`);
    }
  }

  // Bring a client-supplied reasoning_effort into the range this provider accepts.
  if (typeof translatedBody.reasoning_effort === "string") {
    const downgraded = downgradeReasoningEffort(provider, translatedBody.reasoning_effort);
    if (!downgraded) {
      delete translatedBody.reasoning_effort;
      log?.debug?.("PARAMS", `Stripped reasoning_effort for ${provider} (not supported)`);
    } else {
      translatedBody.reasoning_effort = downgraded.effort;
      if (downgraded.reason) log?.debug?.("PARAMS", downgraded.reason);
    }
  }

  const providerCap = getProviderMaxTokensCap(provider, String(translatedBody.model || ""));
  if (providerCap) {
    for (const field of ["max_tokens", "max_completion_tokens"] as const) {
      if (typeof translatedBody[field] === "number" && translatedBody[field] > providerCap) {
        log?.debug?.(
          "PARAMS",
          `Capping ${field} from ${translatedBody[field]} to ${providerCap} for ${provider} (${String(translatedBody.model || "")})`
        );
        translatedBody[field] = providerCap;
      }
    }
  }

  if (provider === "github") {
    const optimization = optimizeGithubRequestBody(
      translatedBody,
      String(translatedBody.model || model || "")
    );
    if (optimization.actions.length > 0) {
      log?.info?.(
        "GITHUB",
        `Applied request optimizations: ${optimization.actions.join(", ")} (model=${String(translatedBody.model || model || "unknown")}, tools=${Array.isArray(translatedBody.tools) ? translatedBody.tools.length : 0})`
      );
    }
  }

  return toolNameMap;
}
