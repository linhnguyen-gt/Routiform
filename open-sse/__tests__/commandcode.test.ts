/**
 * Unit tests for CommandCode translators (request + response)
 *
 * Verified live against upstream `/alpha/generate` (curl, 2026-05-07):
 *  - params.system: STRING at top level (system messages NOT in messages[])
 *  - params.messages[*].role ∈ {"user","assistant","tool"}
 *  - params.messages[*].content: Array<content_block> (NEVER string)
 *  - tools[*]: Anthropic plain {name, description, input_schema}
 *  - tool-input-start: { id, toolName }   (id, NOT toolCallId)
 *  - tool-input-delta: { id, delta }      (id, NOT toolCallId; delta, NOT inputTextDelta)
 */

import { describe, expect, it } from "vitest";

import { openaiToCommandCode } from "../translator/request/openai-to-commandcode.ts";
import { convertCommandCodeToOpenAI } from "../translator/response/commandcode-to-openai.ts";

const MODEL = "moonshotai/Kimi-K2.6";

// ─── Request translator ───────────────────────────────────────────────────────

describe("openaiToCommandCode — basic envelope", () => {
  it("returns the expected top-level envelope shape", () => {
    const out = openaiToCommandCode(MODEL, { messages: [{ role: "user", content: "hi" }] });

    expect(out).toHaveProperty("threadId");
    expect(out).toHaveProperty("memory");
    expect(out).toHaveProperty("config");
    expect(out).toHaveProperty("params");
    expect((out.params as Record<string, unknown>).model).toBe(MODEL);
    expect((out.params as Record<string, unknown>).stream).toBe(true);
  });
});

describe("openaiToCommandCode — system handling", () => {
  it("hoists system messages to params.system (string), not messages[]", () => {
    const out = openaiToCommandCode(MODEL, {
      messages: [
        { role: "system", content: "You are concise." },
        { role: "user", content: "hi" },
      ],
    });

    const params = out.params as Record<string, unknown>;
    expect(typeof params.system).toBe("string");
    expect(params.system).toBe("You are concise.");
    const roles = (params.messages as Array<{ role: string }>).map((m) => m.role);
    expect(roles).not.toContain("system");
  });

  it("joins multiple system messages with blank line", () => {
    const out = openaiToCommandCode(MODEL, {
      messages: [
        { role: "system", content: "A" },
        { role: "system", content: "B" },
        { role: "user", content: "hi" },
      ],
    });
    expect((out.params as Record<string, unknown>).system).toBe("A\n\nB");
  });

  it("omits params.system when no system messages", () => {
    const out = openaiToCommandCode(MODEL, { messages: [{ role: "user", content: "hi" }] });
    expect((out.params as Record<string, unknown>).system).toBeUndefined();
  });
});

describe("openaiToCommandCode — content shape", () => {
  it("MUST always emit content as Array (never string) for user", () => {
    const out = openaiToCommandCode(MODEL, { messages: [{ role: "user", content: "hello" }] });
    const msgs = (out.params as Record<string, unknown>).messages as Array<Record<string, unknown>>;
    const u = msgs[0];
    expect(Array.isArray(u.content)).toBe(true);
    expect((u.content as unknown[])[0]).toEqual({ type: "text", text: "hello" });
  });

  it("MUST always emit content as Array for assistant", () => {
    const out = openaiToCommandCode(MODEL, {
      messages: [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
      ],
    });
    const msgs = (out.params as Record<string, unknown>).messages as Array<Record<string, unknown>>;
    const a = msgs[1];
    expect(Array.isArray(a.content)).toBe(true);
    expect((a.content as unknown[])[0]).toEqual({ type: "text", text: "b" });
  });
});

describe("openaiToCommandCode — tool role / tool-result", () => {
  it('converts role:"tool" to role:"tool" with tool-result block; output is {type:"text",value}', () => {
    const out = openaiToCommandCode(MODEL, {
      messages: [
        { role: "user", content: "run X" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "call_1", type: "function", function: { name: "do_x", arguments: '{"a":1}' } },
          ],
        },
        { role: "tool", tool_call_id: "call_1", name: "do_x", content: "RESULT_OK" },
      ],
    });

    const msgs = (out.params as Record<string, unknown>).messages as Array<Record<string, unknown>>;
    const toolMsg = msgs[msgs.length - 1];
    expect(toolMsg.role).toBe("tool");
    const block = (toolMsg.content as unknown[])[0] as Record<string, unknown>;
    expect(block.type).toBe("tool-result");
    expect(block.toolCallId).toBe("call_1");
    expect(block.toolName).toBe("do_x");
    expect(block.output).toEqual({ type: "text", value: "RESULT_OK" });
  });
});

describe("openaiToCommandCode — assistant tool_calls / tool-call", () => {
  it("converts assistant.tool_calls[] into content blocks of type tool-call", () => {
    const out = openaiToCommandCode(MODEL, {
      messages: [
        { role: "user", content: "go" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_42",
              type: "function",
              function: { name: "search", arguments: '{"q":"hi"}' },
            },
          ],
        },
      ],
    });

    const msgs = (out.params as Record<string, unknown>).messages as Array<Record<string, unknown>>;
    const asst = msgs[1];
    expect(asst.role).toBe("assistant");
    const tc = (asst.content as Array<Record<string, unknown>>).find((b) => b.type === "tool-call");
    expect(tc).toBeDefined();
    expect(tc!.toolCallId).toBe("call_42");
    expect(tc!.toolName).toBe("search");
    expect(tc!.input).toEqual({ q: "hi" });
  });
});

describe("openaiToCommandCode — tools schema conversion", () => {
  it('converts OpenAI {type:"function", function:{...}} to Anthropic plain {name, input_schema}', () => {
    const out = openaiToCommandCode(MODEL, {
      messages: [{ role: "user", content: "hi" }],
      tools: [
        {
          type: "function",
          function: {
            name: "weather",
            description: "Get weather",
            parameters: {
              type: "object",
              properties: { city: { type: "string" } },
              required: ["city"],
            },
          },
        },
      ],
    });

    const params = out.params as Record<string, unknown>;
    const t = (params.tools as Array<Record<string, unknown>>)[0];
    expect(t.name).toBe("weather");
    expect(t.input_schema).toBeDefined();
    expect((t.input_schema as Record<string, unknown>).type).toBe("object");
    expect(t.function).toBeUndefined();
    expect(t.parameters).toBeUndefined();
  });

  it("preserves description on converted tool", () => {
    const out = openaiToCommandCode(MODEL, {
      messages: [{ role: "user", content: "hi" }],
      tools: [
        {
          type: "function",
          function: {
            name: "ping",
            description: "Ping the server",
            parameters: { type: "object" },
          },
        },
      ],
    });
    const params = out.params as Record<string, unknown>;
    expect((params.tools as Array<Record<string, unknown>>)[0].description).toBe("Ping the server");
  });

  it("does not include tools field when input has none", () => {
    const out = openaiToCommandCode(MODEL, { messages: [{ role: "user", content: "hi" }] });
    expect((out.params as Record<string, unknown>).tools).toBeUndefined();
  });
});

// ─── Response translator ──────────────────────────────────────────────────────

type AnyRecord = Record<string, unknown>;

function feed(events: AnyRecord[]) {
  const state: AnyRecord = {};
  const all: AnyRecord[] = [];
  for (const e of events) {
    const out = convertCommandCodeToOpenAI(JSON.stringify(e), state);
    if (out) for (const c of out) all.push(c as AnyRecord);
  }
  return { state, chunks: all };
}

describe("commandcode-to-openai — text-delta", () => {
  it("emits assistant role on first delta then content-only", () => {
    const { chunks } = feed([
      { type: "text-delta", text: "Hello" },
      { type: "text-delta", text: " world" },
    ]);
    expect((chunks[0].choices as AnyRecord[])[0].delta).toMatchObject({
      role: "assistant",
      content: "Hello",
    });
    expect((chunks[1].choices as AnyRecord[])[0].delta).not.toHaveProperty("role");
    expect((chunks[1].choices as AnyRecord[])[0].delta).toMatchObject({ content: " world" });
  });
});

describe("commandcode-to-openai — reasoning-delta", () => {
  it("maps reasoning-delta to reasoning_content delta", () => {
    const { chunks } = feed([{ type: "reasoning-delta", text: "thinking..." }]);
    expect((chunks[0].choices as AnyRecord[])[0].delta).toMatchObject({
      reasoning_content: "thinking...",
    });
  });
});

describe("commandcode-to-openai — tool-input-* with id field (live schema)", () => {
  it("registers tool index using event.id (NOT toolCallId)", () => {
    const { chunks } = feed([
      { type: "tool-input-start", id: "call_X", toolName: "Bash" },
      { type: "tool-input-delta", id: "call_X", delta: '{"cmd' },
      { type: "tool-input-delta", id: "call_X", delta: '":"ls"}' },
    ]);

    const startTc = ((chunks[0].choices as AnyRecord[])[0].delta as AnyRecord)
      .tool_calls as AnyRecord[];
    expect(startTc[0].id).toBe("call_X");
    expect((startTc[0].function as AnyRecord).name).toBe("Bash");

    const d1 = ((chunks[1].choices as AnyRecord[])[0].delta as AnyRecord).tool_calls as AnyRecord[];
    expect((d1[0].function as AnyRecord).arguments).toBe('{"cmd');
    const d2 = ((chunks[2].choices as AnyRecord[])[0].delta as AnyRecord).tool_calls as AnyRecord[];
    expect((d2[0].function as AnyRecord).arguments).toBe('":"ls"}');
  });

  it("ignores tool-input-delta when id is unknown (no prior start)", () => {
    const { chunks } = feed([{ type: "tool-input-delta", id: "unknown", delta: "x" }]);
    expect(chunks.length).toBe(0);
  });
});

describe("commandcode-to-openai — final tool-call event", () => {
  it("does NOT re-emit tool_calls when tool-input-* deltas already fired", () => {
    const { chunks } = feed([
      { type: "tool-input-start", id: "call_Y", toolName: "Write" },
      { type: "tool-input-delta", id: "call_Y", delta: '{"file":"a"}' },
      { type: "tool-call", toolCallId: "call_Y", toolName: "Write", input: { file: "a" } },
    ]);
    expect(chunks.length).toBe(2);
  });

  it("emits a consolidated tool_calls when only the final tool-call event arrives", () => {
    const { chunks } = feed([
      { type: "tool-call", toolCallId: "call_Z", toolName: "Read", input: { path: "/x" } },
    ]);
    expect(chunks.length).toBe(1);
    const tc = (
      ((chunks[0].choices as AnyRecord[])[0].delta as AnyRecord).tool_calls as AnyRecord[]
    )[0];
    expect(tc.id).toBe("call_Z");
    expect((tc.function as AnyRecord).name).toBe("Read");
    expect((tc.function as AnyRecord).arguments).toBe(JSON.stringify({ path: "/x" }));
  });
});

describe("commandcode-to-openai — finish", () => {
  it("emits a final chunk with finish_reason=tool_calls when finishReason is tool-calls", () => {
    const { chunks } = feed([
      { type: "tool-input-start", id: "call_F", toolName: "Bash" },
      { type: "tool-input-delta", id: "call_F", delta: "{}" },
      { type: "finish-step", finishReason: "tool-calls" },
      { type: "finish" },
    ]);
    const last = chunks[chunks.length - 1];
    expect((last.choices as AnyRecord[])[0].finish_reason).toBe("tool_calls");
  });

  it("includes usage on the final chunk when totalUsage provided", () => {
    const { chunks } = feed([
      { type: "text-delta", text: "hi" },
      {
        type: "finish-step",
        finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      },
      { type: "finish", totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
    ]);
    const last = chunks[chunks.length - 1];
    // Both spellings on purpose: the translator emits prompt/completion AND input/output because
    // clients recognise one or the other (commandcode-to-openai.ts:79-99). Asserting only half
    // of that made a deliberate compatibility alias look like a regression.
    expect(last.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      input_tokens: 10,
      output_tokens: 5,
    });
  });
});

describe("commandcode-to-openai — error event", () => {
  it("stringifies object errors so client sees readable message", () => {
    const { chunks } = feed([{ type: "error", error: { type: "server_error", message: "Boom" } }]);
    const text = ((chunks[0].choices as AnyRecord[])[0].delta as AnyRecord).content as string;
    expect(text).toContain("Boom");
    expect(text).not.toContain("[object Object]");
  });
});
