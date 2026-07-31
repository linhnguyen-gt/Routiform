import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Golden characterization of the compression stack, recorded against the CURRENT
 * hardcoded RTK -> Caveman pipeline BEFORE the registry refactor.
 *
 * The point is byte-identity, not structure: after `applyStackedCompression` becomes
 * registry-driven, every one of these bodies must serialize to exactly the same string
 * it does today. A structural assertion ("still has 3 messages", "still shorter") would
 * pass through a refactor that quietly changed which filter ran on which shape.
 *
 * Regenerate deliberately, never reflexively:
 *   UPDATE_COMPRESSION_GOLDENS=1 node --import tsx/esm --test tests/unit/compression-characterization.test.mjs
 * A diff in the golden file during the refactor is the failure this file exists to catch.
 */

const { applyStackedCompression, formatStackHeader } =
  await import("../../open-sse/compression/index.ts");

const GOLDEN_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "compression-goldens.json"
);

const UPDATING = process.env.UPDATE_COMPRESSION_GOLDENS === "1";

// A tool payload large and repetitive enough that RTK's diff filters actually fire.
// Without real hits the goldens would lock in "nothing happened", which characterizes nothing.
function toolDiff() {
  const lines = [
    "diff --git a/src/file.js b/src/file.js",
    "index abc..def 100644",
    "--- a/src/file.js",
    "+++ b/src/file.js",
    "@@ -1,120 +1,120 @@",
  ];
  for (let i = 0; i < 120; i++) {
    lines.push(`-const oldValue${i} = "removed value ${i} with padding padding padding";`);
    lines.push(`+const newValue${i} = "added value ${i} with padding padding padding padding";`);
  }
  return lines.join("\n");
}

const PROSE =
  "I would like to please just really actually explain the reason why it is important " +
  "to note that this particular function appears to be broken in a number of ways.";

/**
 * The five body shapes `compressMessages` branches on (rtk/index.ts:40-111) plus plain
 * prose, which reaches no RTK branch at all and isolates Caveman.
 */
function bodies() {
  return {
    "openai-chat": {
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant. " + PROSE },
        { role: "user", content: PROSE },
        { role: "tool", tool_call_id: "call_1", content: toolDiff() },
      ],
    },

    "openai-responses": {
      model: "gpt-5",
      input: [
        { role: "user", content: PROSE },
        { type: "function_call_output", call_id: "call_1", output: toolDiff() },
        {
          type: "function_call_output",
          call_id: "call_2",
          output: [{ type: "input_text", text: toolDiff() }],
        },
      ],
    },

    "claude-tool-result-string": {
      model: "claude-sonnet-4",
      system: "You are a coding agent. " + PROSE,
      messages: [
        { role: "user", content: PROSE },
        {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_1", content: toolDiff() }],
        },
      ],
    },

    "claude-tool-result-array": {
      model: "claude-sonnet-4",
      messages: [
        { role: "user", content: PROSE },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_1",
              content: [{ type: "text", text: toolDiff() }],
            },
            // is_error blocks are deliberately preserved verbatim (rtk/index.ts:97) —
            // the golden pins that carve-out too.
            {
              type: "tool_result",
              tool_use_id: "toolu_2",
              is_error: true,
              content: toolDiff(),
            },
          ],
        },
      ],
    },

    kiro: {
      conversationState: {
        currentMessage: {
          userInputMessage: {
            content: PROSE,
            userInputMessageContext: {
              toolResults: [{ content: [{ text: toolDiff() }] }],
            },
          },
        },
        history: [
          {
            userInputMessage: {
              content: PROSE,
              userInputMessageContext: {
                toolResults: [{ content: [{ text: toolDiff() }] }],
              },
            },
          },
        ],
      },
    },

    "plain-prose": {
      model: "gpt-4o",
      messages: [
        { role: "user", content: PROSE },
        { role: "assistant", content: PROSE },
      ],
    },
  };
}

// `full` and `safe` are different filter sets, so one user agent characterizes only half
// the behaviour. resolveRtkProfile: unknown UA -> full, coding-agent UA -> safe.
const PROFILES = [
  { label: "full", userAgent: "curl/8.0" },
  { label: "safe", userAgent: "claude-cli/1.0.83" },
];

/** Everything the caller can observe, minus `logs` (human-facing prose, not a contract). */
function observable(body, result) {
  const { logs: _logs, ...rest } = result;
  return { body, result: rest, header: formatStackHeader(result) };
}

function run(bodyFactory, userAgent) {
  const body = bodyFactory();
  const result = applyStackedCompression(body, {
    enabled: true,
    userAgent,
    caveman: true,
    cavemanOutputLevel: "off",
  });
  return observable(body, result);
}

const all = bodies();
const cases = [];
for (const [shape, _body] of Object.entries(all)) {
  for (const profile of PROFILES) {
    cases.push({ key: `${shape}/${profile.label}`, shape, userAgent: profile.userAgent });
  }
}

if (UPDATING) {
  const recorded = {};
  for (const c of cases) {
    recorded[c.key] = run(() => bodies()[c.shape], c.userAgent);
  }
  fs.mkdirSync(path.dirname(GOLDEN_PATH), { recursive: true });
  fs.writeFileSync(GOLDEN_PATH, JSON.stringify(recorded, null, 2) + "\n");
  console.log(`[goldens] recorded ${cases.length} cases to ${GOLDEN_PATH}`);
}

const goldens = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8"));

for (const c of cases) {
  test(`characterization: ${c.key} output is byte-identical to the recorded golden`, () => {
    const golden = goldens[c.key];
    assert.ok(golden, `no golden recorded for ${c.key}`);
    const actual = run(() => bodies()[c.shape], c.userAgent);

    // The contract: the request that goes upstream is unchanged. This is the assertion the
    // whole file exists for, and it is compared as a string, not structurally.
    assert.equal(
      JSON.stringify(actual.body),
      JSON.stringify(golden.body),
      "the compressed request body changed"
    );

    // Every field the old result carried still carries the same value. `engines` is new and
    // additive (R5), so it is excluded here rather than forcing a golden rewrite that would
    // destroy the recorded-before-the-refactor provenance.
    const { engines: _engines, ...legacy } = actual.result;
    assert.deepEqual(legacy, golden.result, "a legacy result field changed");

    // The header gains per-engine segments, which is the one intentional format change in this
    // phase. Asserting the old value is still a prefix pins that it is an ADDITION: nothing
    // that was in the header before has moved or changed meaning.
    assert.ok(
      actual.header.startsWith(golden.header),
      `header no longer extends the recorded value:\n  was: ${golden.header}\n  now: ${actual.header}`
    );
  });
}

test("the header's new per-engine segments name only engines that actually ran", () => {
  const actual = run(() => bodies()["openai-chat"], "curl/8.0");
  const applied = Object.entries(actual.result.engines)
    .filter(([, r]) => r.applied)
    .map(([id]) => id);
  assert.ok(applied.length > 0);
  for (const id of applied) {
    assert.ok(actual.header.includes(`${id}=`), `header omits ${id}`);
  }
  for (const [id, r] of Object.entries(actual.result.engines)) {
    if (!r.applied) {
      assert.ok(!actual.header.includes(`${id}=`), `header names ${id}, which never applied`);
    }
  }
});

test("the golden file covers every recorded case and nothing else", () => {
  assert.deepEqual(Object.keys(goldens).sort(), cases.map((c) => c.key).sort());
});

test("the goldens record real compression, not a no-op", () => {
  // A golden set where nothing shrank would pass the refactor trivially while
  // characterizing nothing. Every shape except plain prose must show RTK hits.
  for (const c of cases) {
    const g = goldens[c.key];
    assert.ok(g.result.bytesAfter <= g.result.bytesBefore, `${c.key} inflated`);
    if (c.shape === "plain-prose") continue;
    assert.ok(g.result.rtkHits > 0, `${c.key} recorded zero RTK hits`);
  }
});

test("caveman runs on every message-shaped body, and on Kiro it does not", () => {
  // Pinning a gap, not a feature. `cavemanCompressMessages` walks `body.messages` or
  // `body.input` only (caveman-en.ts:127-130), so Kiro's `conversationState` gets RTK
  // but zero prose compression — while `compressMessages` does branch on it
  // (rtk/index.ts:41). The asymmetry is today's behaviour; the registry refactor must
  // preserve it, and closing it is a separate, deliberate change.
  for (const c of cases) {
    const g = goldens[c.key];
    if (c.shape === "kiro") {
      assert.equal(g.result.caveman, null, "kiro unexpectedly gained prose compression");
      assert.ok(g.result.rtkHits > 0, "kiro should still get RTK");
      continue;
    }
    assert.ok(g.result.caveman, `${c.key} recorded no caveman stats`);
  }
});
