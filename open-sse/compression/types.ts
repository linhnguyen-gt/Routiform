export type CompressionStackMode = "off" | "rtk" | "stacked";

export type CavemanStats = {
  messagesTouched: number;
  bytesBefore: number;
  bytesAfter: number;
};

export type StackCompressionResult = {
  mode: CompressionStackMode;
  rtkHits: number;
  caveman: CavemanStats | null;
  inflationReverted: boolean;
  bytesBefore: number;
  bytesAfter: number;
};
