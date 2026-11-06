/** Bilinear-sampleable east/north slopes (m/m) over a lon/lat lattice patch:
 *  post `(i, j)` sits at `lon = west + i·stepDeg`, `lat = north − j·stepDeg`,
 *  row-major with row 0 north — the same indexing `HeightSource.readGrid`
 *  uses, so a `SlopeLattice` can be built straight from its posts. */
export type SlopeLattice = {
  readonly west: number;
  readonly north: number;
  readonly stepDeg: number;
  readonly nx: number;
  readonly ny: number;
  readonly sx: Float32Array;
  readonly sy: Float32Array;
};
