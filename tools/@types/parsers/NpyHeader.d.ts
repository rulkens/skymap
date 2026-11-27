/** An `.npy` v1 header, parsed by `readNpyHeader`. */
export type NpyHeader = {
  /** '<f2', '<f4' or '<f8'. */
  readonly dtype: string;
  readonly shape: readonly number[];
  /** Byte offset of the first value: 10 + the v1 header length. */
  readonly dataOffset: number;
};
