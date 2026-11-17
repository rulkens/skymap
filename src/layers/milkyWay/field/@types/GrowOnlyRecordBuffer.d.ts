export type GrowOnlyRecordBuffer = {
  getBuffer(): GPUBuffer;
  /** Records in the last `write`. NOT the capacity, which only ever grows. */
  readonly count: number;
  /** Grow to fit `records`, then upload. */
  write(records: Float32Array): void;
  destroy(): void;
};
