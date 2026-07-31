import type { EngineStage } from "./engine-types.ts";

/**
 * Pure-data description of the built-in engines.
 *
 * It exists because the MCP `get_compression_info` tool has to describe the stack, and importing
 * the registry to do so drags RTK's entire filter tree into a strict typecheck project that never
 * covered it — 41 pre-existing errors in files unrelated to compression. The alternative was a
 * hardcoded list in the MCP handler, which is the same class of defect C3 found there in the
 * first place: a literal that silently stops matching reality.
 *
 * So the literal lives once, here, with no runtime dependency on the engine implementations, and
 * `registry.ts` asserts that what it actually registered matches. Adding an engine without
 * updating this file fails at registration, not in production.
 */
export interface EngineDescriptor {
  id: string;
  stage: EngineStage;
  order: number;
  gateCleared: boolean;
  summary: string;
}

export const ENGINE_CATALOG: readonly EngineDescriptor[] = [
  {
    id: "lite",
    stage: "lossless",
    order: 50,
    gateCleared: false,
    summary: "Whitespace collapse and data-URL trimming, preserving code, inline code and URLs.",
  },
  {
    id: "rtk",
    stage: "lossless",
    order: 100,
    gateCleared: true,
    summary: "Filters tool-result payloads: truncates long reads, caps grep and diff output.",
  },
  {
    id: "gcf",
    stage: "lossless",
    order: 300,
    gateCleared: false,
    summary:
      "Hoists shared keys out of homogeneous JSON arrays in tool output and emits rows as tuples.",
  },
  {
    id: "responses-compact",
    stage: "lossless",
    order: 400,
    gateCleared: false,
    summary:
      "Drops insignificant whitespace from Responses tool output, skipping anything RTK rewrote.",
  },
  {
    id: "caveman-en",
    stage: "lossy",
    order: 100,
    gateCleared: true,
    summary: "Strips English filler from prose. Lossy; never touches code fences or URLs.",
  },
];

export const CATALOG_ENGINE_IDS: string[] = ENGINE_CATALOG.map((e) => e.id);
