/** A decoded `.npy` array, as `readNpy` returns it. */
export type NpyArray = {
  /** '<f2', '<f4' or '<f8'. */
  dtype: string;
  shape: number[];
  /** Typed to the on-disk dtype; f16 stays raw bits (a `Uint16Array`), as SCFD consumes it. */
  values: Float64Array | Float32Array | Uint16Array;
};
