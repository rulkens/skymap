/** PixelImage — the `ImageData` shape (RGBA8, row-major) without the DOM dependency, so pure pixel code runs under node. */
export type PixelImage = {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
};
