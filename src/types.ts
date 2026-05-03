/** A point cloud in renderer-ready layout. */
export interface PointCloud {
  /** Number of points. */
  count: number;
  /** Interleaved xyz (Float32) — length === count * 3. Coordinates in Mpc. */
  positions: Float32Array;
  /** Apparent magnitude per point — length === count. */
  magnitudes: Float32Array;
  /** Color index (e.g. SDSS u-g) per point — length === count. */
  colorIndex: Float32Array;
}
