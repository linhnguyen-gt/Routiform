export type CompressionStackMode = "off" | "rtk" | "stacked";

export type CavemanStats = {
  messagesTouched: number;
  bytesBefore: number;
  bytesAfter: number;
};

/**
 * Output-side caveman: a system-prompt directive that makes the *model*
 * emit terser output (as opposed to `caveman-en.ts`, which rewrites the
 * *input* text). Output tokens cost 3-5x input tokens.
 *
 * YAGNI: only `lite` / `full` are implemented. Upstream also has `ultra`,
 * `wenyan`, and `wenyan-ultra` — not ported until someone asks for them.
 */
export type CavemanOutputLevel = "off" | "lite" | "full";

/** Where the output-directive was injected into the request body. */
export type CavemanOutputTarget = "system-field" | "system-message" | "new-system-message";

export type CavemanOutputResult = {
  level: Exclude<CavemanOutputLevel, "off">;
  target: CavemanOutputTarget;
};

export type StackCompressionResult = {
  mode: CompressionStackMode;
  rtkHits: number;
  caveman: CavemanStats | null;
  cavemanOutput: CavemanOutputResult | null;
  inflationReverted: boolean;
  bytesBefore: number;
  bytesAfter: number;
};
