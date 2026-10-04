/** A one-band ISIS cube decoded to row-major Float32, row 0 at the top. Special
 *  pixels (NULL, LRS, ...) are NaN. `leftLonDeg` is the east longitude of the
 *  left edge of column 0, from the label's projection, not the filename. */
export type IsisCubeRaster = {
  readonly data: Float32Array;
  readonly width: number;
  readonly height: number;
  readonly leftLonDeg: number;
};
