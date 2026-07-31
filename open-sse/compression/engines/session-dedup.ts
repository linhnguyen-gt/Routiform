import crypto from "node:crypto";
import { resolveContainer } from "../engine-types.ts";
import type { CompressionEngine, EngineContext, EngineResult } from "../engine-types.ts";
import { DEDUP_MIN_BLOCK_BYTES, DEDUP_TTL_MS } from "./dedup-store.ts";
import type { DedupBlock, DedupStore } from "./dedup-store.ts";
import { MemoryDedupStore } from "./memory-dedup-store.ts";

/**
 * Content-addressed dedup of blocks that repeat across turns of one conversation.
 *
 * Agent loops resend the same file contents every turn, so this is the largest lossless win
 * available. "Lossless" here means the model can recover the content: the marker points at
 * something it was already sent EARLIER IN THIS CONVERSATION. It is a back-reference, not
 * archival — nothing has to be retrieved, which is what separates this from CCR.
 *
 * Two structural rules, both learned from failure modes rather than style:
 *
 * 1. `apply()` NEVER writes to the store. `applyStackedCompression` runs once per RETRY ATTEMPT,
 *    not once per logical request. A write inside `apply()` is unconditioned on that attempt
 *    succeeding: attempt 1 stores and then fails, attempt 2 finds a hit and emits a marker for
 *    content no upstream ever received, and the model is told to recall something it was never
 *    sent. Writes are staged and committed after success.
 *
 * 2. The key carries the tenant unconditionally. There is no derived-key fallback. The rejected
 *    design hashed the prompt prefix, which for coding agents is identical across every
 *    conversation sharing a system prompt — and on Anthropic-shaped bodies, where `system` is a
 *    top-level field rather than a message, degenerates to sha256("") for everyone. Deduping on
 *    that would replace one caller's content with a reference to another's.
 */

const MARKER_PREFIX = "<routiform:deduped";

let store: DedupStore = new MemoryDedupStore();

/** Swap the store (SQLite in production, memory in tests). */
export function setDedupStore(next: DedupStore): void {
  store = next;
}

export function getDedupStore(): DedupStore {
  return store;
}

function hashBlock(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * The replacement marker.
 *
 * XML-ish and explicit because research found weak markers are more often ignored outright. The
 * preview matters as much as the hash: it tells the model WHICH earlier block this refers to, so
 * it can find it without being told where to look.
 */
function formatMarker(hash: string, bytes: number, preview: string): string {
  const cleaned = preview.replace(/\s+/g, " ").slice(0, 120);
  return `${MARKER_PREFIX} hash="${hash.slice(0, 16)}" bytes="${bytes}">Identical content was already sent earlier in this conversation. Reuse it. Begins: ${cleaned}</routiform:deduped>`;
}

/** Every text location this engine is willing to consider, with in-place read/write access. */
interface Candidate {
  index: number;
  read: () => string;
  write: (value: string) => void;
}

function collectCandidates(items: Record<string, unknown>[]): Candidate[] {
  const out: Candidate[] = [];

  items.forEach((msg, index) => {
    if (!msg || typeof msg !== "object") return;

    // Tool output only. Prose is where a marker is most likely to be misread as instruction, and
    // agent loops resend tool output, not their own sentences.
    if (msg.type === "function_call_output" && typeof msg.output === "string") {
      out.push({
        index,
        read: () => msg.output as string,
        write: (value) => {
          msg.output = value;
        },
      });
      return;
    }

    if (msg.role === "tool" && typeof msg.content === "string") {
      out.push({
        index,
        read: () => msg.content as string,
        write: (value) => {
          msg.content = value;
        },
      });
      return;
    }

    if (!Array.isArray(msg.content)) return;

    for (const raw of msg.content as unknown[]) {
      const block = raw as Record<string, unknown> | null;
      if (!block || block.type !== "tool_result" || block.is_error === true) continue;

      if (typeof block.content === "string") {
        out.push({
          index,
          read: () => block.content as string,
          write: (value) => {
            block.content = value;
          },
        });
        continue;
      }

      if (Array.isArray(block.content)) {
        for (const rawPart of block.content as unknown[]) {
          const part = rawPart as Record<string, unknown> | null;
          if (!part || part.type !== "text" || typeof part.text !== "string") continue;
          out.push({
            index,
            read: () => part.text as string,
            write: (value) => {
              part.text = value;
            },
          });
        }
      }
    }
  });

  return out;
}

export const sessionDedupEngine: CompressionEngine = {
  id: "session-dedup",
  stage: "lossless",
  order: 200,
  gateCleared: false,

  supports(ctx: EngineContext): boolean {
    // Both identities required, no fallback. Absent either one, this engine does not run — that
    // is the correct outcome rather than a limitation to work around.
    if (!ctx.apiKeyId || !ctx.conversationId) return false;
    return ctx.bodyShape !== "kiro" && ctx.bodyShape !== "unknown";
  },

  apply(body: Record<string, unknown>, ctx: EngineContext): Omit<EngineResult, "reverted"> {
    const container = resolveContainer(body);
    const apiKeyId = ctx.apiKeyId;
    const conversationId = ctx.conversationId;

    if (!container || !apiKeyId || !conversationId) {
      return { applied: false, stats: {}, bytesBefore: 0, bytesAfter: 0, touchedIndices: [] };
    }

    const touched = new Set<number>();
    const staged: DedupBlock[] = [];
    let bytesBefore = 0;
    let bytesAfter = 0;
    let hits = 0;
    let misses = 0;

    for (const candidate of collectCandidates(container.items)) {
      const text = candidate.read();
      if (text.length < DEDUP_MIN_BLOCK_BYTES) continue;
      if (text.startsWith(MARKER_PREFIX)) continue;

      const hash = hashBlock(text);
      const key = { apiKeyId, conversationId, hash };
      const existing = store.get(key);

      if (!existing) {
        // A miss re-sends the full block. Dedup is an optimisation and correctness is never
        // traded for it — an evicted or expired entry must not produce a dangling reference.
        misses++;
        staged.push({ ...key, content: text, bytes: text.length });
        continue;
      }

      const marker = formatMarker(hash, text.length, text);
      if (marker.length >= text.length) continue;

      candidate.write(marker);
      store.touch(key);
      touched.add(candidate.index);
      bytesBefore += text.length;
      bytesAfter += marker.length;
      hits++;
    }

    // Staged, never written. The commit runs after upstream accepted the request — see the
    // module note on why a write here would poison the store on a failed retry.
    if (staged.length > 0) {
      ctx.deferredWrites.push({
        engineId: "session-dedup",
        commit: () => {
          store.put(staged);
          store.sweep(DEDUP_TTL_MS);
        },
      });
    }

    return {
      applied: touched.size > 0,
      stats: { hits, misses, hitRate: hits + misses > 0 ? hits / (hits + misses) : 0 },
      bytesBefore,
      bytesAfter,
      touchedIndices: [...touched].sort((a, b) => a - b),
    };
  },
};
