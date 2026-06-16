export type FilterFn = ((text: string, ...args: unknown[]) => string) & { filterName?: string };

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
