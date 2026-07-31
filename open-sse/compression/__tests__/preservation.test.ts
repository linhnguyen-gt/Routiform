import { describe, expect, it } from "vitest";
import { withPreservedSpans } from "../preservation.ts";

/**
 * `withPreservedSpans` is the only thing standing between a rule-based compressor and a
 * mangled code block, and until now it had a single consumer (caveman-en.ts:46) and no
 * test of its own. Phase 01's Lite engine becomes a second consumer, so its guarantees
 * are pinned here before anything new relies on them.
 *
 * Two of these tests document real limitations rather than asserting a fix. Preservation
 * is masking, not parsing, and pretending otherwise is how a "protected" span quietly
 * stops being protected.
 */

/** A transform destructive enough that any unmasked span is visibly corrupted. */
const shout = (s: string) => s.replace(/[a-z]+/g, (w) => w.toUpperCase());
/** A transform that deletes everything it can see. */
const erase = () => "";

describe("withPreservedSpans", () => {
  it("leaves a fenced code block byte-identical while transforming around it", () => {
    const code = "```js\nconst please = true;\n```";
    const out = withPreservedSpans(`prose before ${code} prose after`, shout);
    expect(out).toContain(code);
    expect(out.startsWith("PROSE BEFORE")).toBe(true);
    expect(out.endsWith("PROSE AFTER")).toBe(true);
  });

  it("preserves tilde fences as well as backtick fences", () => {
    const code = "~~~python\nx = 1\n~~~";
    expect(withPreservedSpans(`see ${code} end`, shout)).toContain(code);
  });

  it("preserves inline code and bare URLs", () => {
    const inline = "`array.map(fn)`";
    const url = "https://example.com/a/b?c=d&e=f";
    const out = withPreservedSpans(`call ${inline} then fetch ${url} now`, shout);
    expect(out).toContain(inline);
    expect(out).toContain(url);
  });

  it("does not treat a URL inside a fence as a second span", () => {
    const code = "```\nhttps://example.com/inside\n```";
    expect(withPreservedSpans(code, shout)).toBe(code);
  });

  it("restores every span when the transform deletes all visible text", () => {
    // The transform returns "" — every placeholder is gone, so nothing is restored.
    // Recorded because it is the failure mode a caller must not rely on us to prevent:
    // preservation protects span CONTENT from rewriting, not spans from deletion.
    const out = withPreservedSpans("a `b` c", erase);
    expect(out).toBe("");
  });

  it("restores spans in order when several of each kind are present", () => {
    const input = "`one` and https://a.example and ```\ntwo\n``` and `three`";
    expect(withPreservedSpans(input, (s) => s)).toBe(input);
  });

  it("survives a literal placeholder sentinel in the input", () => {
    // The sentinel is \u0000P<n>\u0000. Input containing it verbatim could steal slot 0
    // on restore. NUL is not valid in JSON string content per the spec's escaping rules
    // and effectively never appears in model traffic, but the behaviour is pinned so a
    // future sentinel change (to something printable) cannot silently corrupt restore.
    const hostile = "\u0000P0\u0000 and `real`";
    const out = withPreservedSpans(hostile, (s) => s);
    // Slot 0 is `real`; the forged sentinel resolves to it, and the real span's own
    // placeholder resolves to it too. Both become the same text — a collision.
    expect(out).toBe("`real` and `real`");
  });

  it("returns unmatched placeholders as empty rather than throwing", () => {
    // A transform that invents a placeholder index gets "" back, not a crash.
    const out = withPreservedSpans("plain", () => "\u0000P7\u0000");
    expect(out).toBe("");
  });

  it("is a no-op for text with no protected spans", () => {
    expect(withPreservedSpans("just prose here", (s) => s)).toBe("just prose here");
  });

  it("does not span across an unterminated fence", () => {
    // An opening fence with no closer is not a span, so its content is transformed.
    const out = withPreservedSpans("```js\nconst x = 1;", shout);
    expect(out).toContain("CONST X = 1;");
  });
});
