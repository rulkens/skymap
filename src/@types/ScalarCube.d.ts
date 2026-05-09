/**
 * ScalarCube — runtime form of a `SCFD` v1 binary.
 *
 * Shape after decoding:  the `voxels` array is x-fastest, then y, then z,
 * matching the on-disk byte order.  All metadata fields are decoded into
 * native JS numbers so downstream code never re-parses the header.
 *
 * Why a `f16` Uint16Array on the JS side:  WebGPU's `r16float` 3D texture
 * upload accepts the raw 2-byte representation directly; we store it as
 * `Uint16Array` so the decoder can `set()` the bytes without per-element
 * conversion.  The shader sees full f16 precision; the CPU side never
 * materialises floats unless a test specifically asks (and the synthetic
 * builder writes them out via a small float→f16 helper).
 */

export type ScalarFieldFrameKind = 'supergalactic-cartesian' | 'equatorial-cartesian' | 'galactic';

export type ScalarFieldPaletteId = 'viridis' | 'magma' | 'blue-purple' | 'yellow-green';

export type ScalarCube = {
  /** Voxel grid dimensions; x-fastest. */
  readonly dims: readonly [number, number, number];
  /** Raw f16 voxels as Uint16, length = dims[0] * dims[1] * dims[2]. */
  readonly voxels: Uint16Array;
  /** Coordinate frame the cube lives in.  Renderer maps this to world. */
  readonly frameKind: ScalarFieldFrameKind;
  /** Position of voxel (0,0,0) corner in `frameKind`'s coords, Mpc. */
  readonly origin: readonly [number, number, number];
  /** Edge length of one cubic voxel in Mpc. */
  readonly voxelSize: number;
  /** Unit quaternion (x, y, z, w) applied in the native frame. */
  readonly rotation: readonly [number, number, number, number];
  /** Palette identifier the renderer should use for this field. */
  readonly paletteId: ScalarFieldPaletteId;
  /**
   * Per-cube opacity multiplier baked into per-step alpha alongside the
   * UI intensity slider:
   *
   *     alpha_per_step = palette.a * intensity * densityScale * stepLength
   *
   * Why this exists: the shader's path-length-correct integral
   * (∫ density × dx along the ray) gives a raw total opacity that depends
   * heavily on the data's dynamic range.  A synthetic Gaussian where most
   * voxels are near zero integrates to ≈ 0.25 along its peak axis — at
   * `intensity=1` that's a dim, never-saturating overlay.  A real CF-4
   * normalised density-contrast cube has different statistics, MCPM
   * agent density different again, future X-ray/temperature fields
   * different yet again.  `densityScale` is the per-cube knob that maps
   * "data-shape-dependent integrated density" onto "saturate at slider=1".
   *
   * Set by the data source: synthetic generators hard-code a value tuned
   * to give a saturated peak at intensity=1; real fetchers should compute
   * it from voxel statistics (e.g. choose scale such that a path through
   * the 99th-percentile density saturates).
   *
   * Legacy SCFD files written before this field existed decode to 1.0
   * (the SCFD decoder treats a zero in the densityScale slot as "field
   * absent" and substitutes the neutral default).
   */
  readonly densityScale: number;
  /** Diagnostic; only meaningful when the source data was raw, not pre-normalised. */
  readonly valueMin: number;
  readonly valueMax: number;
};
