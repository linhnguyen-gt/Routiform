"use client";

import type { MessageUsage } from "./message-bubble";

/**
 * Token counts for one turn.
 *
 * Tokens only, deliberately. Cost is NOT in the router's response — it is computed
 * after the stream in a detached promise, from the RESOLVED provider/model (post
 * failover, post model-override), and written straight to the ledger. Recomputing
 * it here from the requested model would produce a number that disagrees with the
 * dashboard on exactly the requests where it matters.
 *
 * The route now persists `request_id` (X-Routiform-Request-Id), which is the join
 * key back to call_logs. Surfacing a cost that MATCHES the dashboard is a small
 * follow-up on top of that, not a guess made here.
 */

interface UsageBadgeProps {
  usage: MessageUsage;
}

export function UsageBadge({ usage }: UsageBadgeProps) {
  const { inputTokens, outputTokens } = usage;
  if (inputTokens === null && outputTokens === null) return null;

  return (
    <span
      className="font-mono text-[10px] text-text-muted"
      title="Tokens reported by the router for this turn"
    >
      {inputTokens ?? "—"} in · {outputTokens ?? "—"} out
    </span>
  );
}
