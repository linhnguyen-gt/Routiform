/**
 * Collapse consecutive duplicate user/tool messages.
 *
 * Generic safety net for buggy clients that re-append the same inbound message
 * twice in `messages[]` (e.g. OpenClaw issue #10377). Conservative on purpose:
 *
 *   - Only collapses ADJACENT duplicates. A repeated phrase later in the
 *     conversation is preserved.
 *   - Only touches `user` and `tool` roles. Assistant/system content is never
 *     modified — we cannot infer intent from those.
 *   - Hash includes role, content, tool_call_id and tool_calls so two tool
 *     results with different binding ids do NOT collide.
 *   - Multi-modal content arrays are stringified deterministically; identical
 *     image/text payloads collapse, anything different stays.
 *
 * Returns the (possibly) cleaned messages plus the count removed for metrics.
 */

interface MessageLike {
  role?: string;
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: unknown;
  name?: string;
  [key: string]: unknown;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${parts.join(",")}}`;
}

function hashMessage(msg: MessageLike): string {
  const role = String(msg.role ?? "");
  const content = stableStringify(msg.content ?? null);
  const toolCallId = String(msg.tool_call_id ?? "");
  const toolCalls = stableStringify(msg.tool_calls ?? null);
  const name = String(msg.name ?? "");
  return `${role}::${toolCallId}::${name}::${toolCalls}::${content}`;
}

export interface DedupeMessagesResult<T extends MessageLike> {
  messages: T[];
  removed: number;
}

/**
 * Collapse adjacent duplicate user/tool messages.
 * Pass-through for any other role; resets the dedupe window so a later user
 * message that happens to match an earlier one is preserved.
 */
export function dedupeConsecutiveMessages<T extends MessageLike>(
  messages: readonly T[]
): DedupeMessagesResult<T> {
  if (!Array.isArray(messages) || messages.length < 2) {
    return { messages: [...(messages ?? [])], removed: 0 };
  }

  const out: T[] = [];
  let removed = 0;
  let prevHash: string | null = null;
  let prevDedupeRole: string | null = null;

  for (const msg of messages) {
    const role = msg?.role;

    // Reset window for any non-deduped role so later user/tool turns are not
    // accidentally compared against a stale hash from before a system turn.
    if (role !== "user" && role !== "tool") {
      out.push(msg);
      prevHash = null;
      prevDedupeRole = null;
      continue;
    }

    const h = hashMessage(msg);
    if (prevHash !== null && prevDedupeRole === role && h === prevHash) {
      removed++;
      continue;
    }

    out.push(msg);
    prevHash = h;
    prevDedupeRole = role;
  }

  return { messages: out, removed };
}
