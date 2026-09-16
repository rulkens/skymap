/** DecodedPixels — an 8-bit image already out of its container, as sharp's
 *  raw RGB or RGBA in the tools. */
export type DecodedPixels = {
  readonly data: ArrayLike<number>;
  readonly width: number;
  readonly height: number;
  readonly channels: 3 | 4;
};
