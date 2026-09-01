import { z } from "zod";

const CODEX_REASONING_EFFORT_VALUES = new Set(["none", "low", "medium", "high", "xhigh"]);
const REQUEST_DEFAULT_SERVICE_TIER_VALUES = new Set(["priority", "fast"]);

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateProviderSpecificData(
  data: Record<string, unknown> | undefined,
  ctx: z.RefinementCtx
): void {
  if (!data) return;

  const baseUrl = data.baseUrl;
  if (baseUrl !== undefined && (typeof baseUrl !== "string" || !isHttpUrl(baseUrl))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "providerSpecificData.baseUrl must be a valid http(s) URL",
      path: ["baseUrl"],
    });
  }

  const customUserAgent = data.customUserAgent;
  if (
    customUserAgent !== undefined &&
    customUserAgent !== null &&
    (typeof customUserAgent !== "string" || customUserAgent.length > 500)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "providerSpecificData.customUserAgent must be a string up to 500 chars",
      path: ["customUserAgent"],
    });
  }

  const settingsCookie = data.settingsCookie;
  if (
    settingsCookie !== undefined &&
    settingsCookie !== null &&
    (typeof settingsCookie !== "string" || settingsCookie.length > 4000)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "providerSpecificData.settingsCookie must be a string up to 4000 chars",
      path: ["settingsCookie"],
    });
  }

  const requestDefaults = data.requestDefaults;
  if (requestDefaults === undefined) return;
  if (!requestDefaults || typeof requestDefaults !== "object" || Array.isArray(requestDefaults)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "providerSpecificData.requestDefaults must be an object",
      path: ["requestDefaults"],
    });
    return;
  }

  const requestDefaultsRecord = requestDefaults as Record<string, unknown>;
  const reasoningEffort = requestDefaultsRecord.reasoningEffort;
  if (
    reasoningEffort !== undefined &&
    reasoningEffort !== null &&
    (typeof reasoningEffort !== "string" ||
      !CODEX_REASONING_EFFORT_VALUES.has(reasoningEffort.trim().toLowerCase()))
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "providerSpecificData.requestDefaults.reasoningEffort must be one of none, low, medium, high, xhigh",
      path: ["requestDefaults", "reasoningEffort"],
    });
  }

  const serviceTier = requestDefaultsRecord.serviceTier;
  if (
    serviceTier !== undefined &&
    serviceTier !== null &&
    (typeof serviceTier !== "string" ||
      !REQUEST_DEFAULT_SERVICE_TIER_VALUES.has(serviceTier.trim().toLowerCase()))
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "providerSpecificData.requestDefaults.serviceTier must be priority when provided",
      path: ["requestDefaults", "serviceTier"],
    });
  }
}
