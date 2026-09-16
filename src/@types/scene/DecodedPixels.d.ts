/** DecodedPixels — an 8-bit image already out of its container: canvas RGBA
 *  in the browser, sharp's raw RGB in the tools. */
export type DecodedPixels = {
  readonly data: ArrayLike<number>;
  readonly width: number;
  readonly height: number;
  readonly channels: 3 | 4;
};
