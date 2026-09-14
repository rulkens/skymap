/** A single-channel 8-bit raster, row 0 at the top. */
export type GreyRaster = {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
};
