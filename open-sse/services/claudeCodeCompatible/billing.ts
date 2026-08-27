import { computeFingerprint, extractFirstUserMessageText } from "../claudeCodeFingerprint.ts";
import { CLAUDE_CODE_COMPATIBLE_VERSION } from "./constants.ts";

/**
 * Build the billing header dynamically with fingerprint and CCH placeholder.
 * The cch=00000 placeholder is later replaced by signRequestBody().
 */
export function buildBillingHeader(messages?: Array<{ role?: string; content?: unknown }>): string {
  const msgText = extractFirstUserMessageText(messages);
  const fp = computeFingerprint(msgText, CLAUDE_CODE_COMPATIBLE_VERSION);
  return `x-anthropic-billing-header: cc_version=${CLAUDE_CODE_COMPATIBLE_VERSION}.${fp}; cc_entrypoint=cli; cch=00000;`;
}
