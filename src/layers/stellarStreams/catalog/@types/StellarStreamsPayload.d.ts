export type StellarStreamsPayload = {
  readonly particleCount: number;
  readonly streamCount: number;
  /** particleCount × STELLAR_STREAMS_RECORD_F32, GPU-ready (layout in stellarStreamsFormat.constants.ts). */
  readonly records: Float32Array;
};
