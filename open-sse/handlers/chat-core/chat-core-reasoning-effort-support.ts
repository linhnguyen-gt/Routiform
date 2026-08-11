/**
 * Which reasoning-effort levels each provider actually accepts, and how to bring an
 * out-of-range level back into range.
 *
 * Shared by the post-translation tuning pass and by model-default injection so a level
 * set in settings goes through the same ladder a client-supplied one does.
 */

// Providers that natively support xhigh reasoning_effort
const XHIGH_SUPPORTED_PROVIDERS = new Set(["claude", "commandcode"]);
// Providers that do not support reasoning_effort at all
const NO_REASONING_EFFORT_PROVIDERS = new Set(["mistral"]);

/**
 * Providers whose reasoning_effort enum is not OpenAI's.
 *
 * DeepSeek V4 accepts only low/high/max — "max" is a real level for it, not the alias
 * for xhigh it is on OpenAI, and neither "medium" nor "xhigh" is in its enum.
 * See https://api-docs.deepseek.com/guides/thinking_mode.
 *
 * A level absent from a provider's table is dropped rather than mapped, so "none" — which
 * asks for no reasoning at all — turns the field off instead of being rounded up to the
 * provider's lowest thinking level.
 */
const PROVIDER_EFFORT_ENUMS: Record<string, Record<string, string>> = {
  deepseek: { low: "low", medium: "high", high: "high", xhigh: "high", max: "max" },
};

export function providerSupportsReasoningEffort(provider: string): boolean {
  return !NO_REASONING_EFFORT_PROVIDERS.has(provider);
}

function providerSupportsXhigh(provider: string): boolean {
  return XHIGH_SUPPORTED_PROVIDERS.has(provider) || provider.startsWith("anthropic-compatible-");
}

/**
 * Bring a reasoning effort into the range the provider accepts.
 *
 * Providers with their own enum are mapped through it. For everyone else the enum is
 * OpenAI's, where "max" is never a valid value — clamp it to xhigh first, then let the
 * xhigh downgrade decide whether it needs to go further to high. Without this, "max"
 * reaches OpenAI-format providers verbatim and they return HTTP 400
 * "max effort not support".
 *
 * Returns null when the provider takes no reasoning effort at all, meaning the caller
 * should drop the field rather than send a downgraded one.
 */
export function downgradeReasoningEffort(
  provider: string,
  effort: string
): { effort: string; reason: string | null } | null {
  if (!providerSupportsReasoningEffort(provider)) return null;

  const providerEnum = PROVIDER_EFFORT_ENUMS[provider];
  if (providerEnum) {
    const mapped = providerEnum[effort];
    if (!mapped) return null;
    return {
      effort: mapped,
      reason:
        mapped === effort ? null : `Mapped reasoning_effort ${effort}→${mapped} for ${provider}`,
    };
  }

  let current = effort;
  let reason: string | null = null;

  if (current === "max") {
    current = "xhigh";
    reason = `Downgraded reasoning_effort max→xhigh for ${provider}`;
  }
  if (current === "xhigh" && !providerSupportsXhigh(provider)) {
    current = "high";
    reason = `Downgraded reasoning_effort xhigh→high for ${provider}`;
  }

  return { effort: current, reason };
}
