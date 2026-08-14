/**
 * Antigravity header utilities.
 *
 * Generates User-Agent strings and API client headers that match
 * the real Antigravity client flows.
 *
 * Based on CLIProxyAPI's misc/header_utils.go.
 */

const ANTIGRAVITY_VERSION = "1.1.13";

/** Antigravity CLI build stamp; travels in the User-Agent as `cl=`. */
const ANTIGRAVITY_CHANGELIST = "964361259";

export const ANTIGRAVITY_CREDIT_PROBE_API_CLIENT = "google-genai-sdk/1.30.0 gl-node/v22.21.1";

/**
 * Antigravity CLI User-Agent, captured verbatim from the real client:
 *
 *   antigravity/cli/1.1.13 (aidev_client; os_type=darwin; arch=arm64; cl=…; auth_method=consumer)
 *
 * This string is not cosmetic — cloudcode-pa gates the model catalogue on it.
 * Measured against v1internal:fetchAvailableModels with one identical token:
 *
 *   antigravity/1.107.0 darwin/arm64   → 24 models, no Gemini 3.7 Flash
 *   this string                        → 27 models, Gemini 3.7 Flash high/low/medium
 *
 * The old value was the Antigravity *IDE*'s VSCode-OSS version, which the
 * backend answers with an older lineup. Refresh this the same way it was
 * obtained — proxy the CLI and read the header — rather than by guessing a
 * version bump; the `cl` stamp cannot be derived from the version number.
 *
 * Always claims darwin/arm64 regardless of actual server OS. Real Antigravity
 * is a macOS tool — claiming linux/amd64 from a datacenter IP is MORE
 * suspicious than darwin/arm64.
 */
export function antigravityUserAgent(): string {
  return (
    `antigravity/cli/${ANTIGRAVITY_VERSION} ` +
    `(aidev_client; os_type=darwin; arch=arm64; cl=${ANTIGRAVITY_CHANGELIST}; auth_method=consumer)`
  );
}

export function googApiClientHeader(): string {
  return ANTIGRAVITY_CREDIT_PROBE_API_CLIENT;
}

export { ANTIGRAVITY_VERSION };
