// Compression profile selecting which filters run and at which caps.
// - "off":  passthrough — compressMessages returns immediately
// - "safe": coding-agent clients — keeps safe filters, disables
//          read-numbered/smart-truncate and raises grep/find/search caps
// - "full": non-agent clients with auto-compress — all filters (current behavior)
export type RtkProfile = "off" | "safe" | "full";

export type FilterFn = ((text: string, ctx: RtkFilterContext, ...args: unknown[]) => string) & {
  filterName?: string;
};

// Context handed to every filter. Today only carries the active profile so
// filters can raise caps or bail out in "safe" mode. Extensible without
// breaking filter signatures.
export interface RtkFilterContext {
  profile: Exclude<RtkProfile, "off">;
}

export interface RtkHit {
  shape: string;
  filter: string;
  saved: number;
}

export interface RtkStats {
  bytesBefore: number;
  bytesAfter: number;
  hits: RtkHit[];
}
