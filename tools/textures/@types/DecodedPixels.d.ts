/** DecodedPixels — a packed 8-bit RGB image already out of its container
 *  (sharp's raw output with alpha removed). */
export type DecodedPixels = {
  readonly data: ArrayLike<number>;
  readonly width: number;
  readonly height: number;
};
