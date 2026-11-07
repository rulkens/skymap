/** A global equirectangular raster, row 0 at the north pole, column 0 at lon −180°. */
export type EquirectGrid = {
  readonly width: number;
  readonly height: number;
  /** Row-major, `width·height` samples. */
  readonly data: ArrayLike<number>;
};
