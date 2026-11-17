/** A window of the global height lattice (`HeightSource.readGrid`'s addressing):
 * post (ii, jj) is lattice post (i0 + ii, j0 + jj) at level `z`, metres, NaN
 * where the source has none. `wraps` = the window spans every longitude, so
 * column filters wrap round instead of clamping at its edges. */
export type HeightGrid = {
  readonly z: number;
  readonly i0: number;
  readonly j0: number;
  readonly nx: number;
  readonly ny: number;
  readonly wraps: boolean;
  readonly h: Float32Array;
};
