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

import type { Vec3, Vec4 } from './Vec';

export type ScalarFieldFrameKind = 'supergalactic-cartesian' | 'equatorial-cartesian' | 'galactic';

export type ScalarFieldPaletteId =
  | 'viridis'
  | 'magma'
  | 'inferno'
  | 'blue-purple'
  | 'yellow-green'
  /**
   * Divergent blue → neutral → red, with V-shaped alpha (visible at
   * both ends, transparent at the midpoint).  Designed for fields
   * centered on a meaningful zero — CF-4 density contrast, residual
   * peculiar-velocity divergence, anything where voids and overdensities
   * are equally interesting and the cosmic mean should fade out.
   * Inspired by matplotlib's `coolwarm` / `bwr` colour scheme.
   */
  | 'coolwarm';

export type ScalarCube = {
  /** Voxel grid dimensions; x-fastest. */
  readonly dims: Vec3;
  /** Raw f16 voxels as Uint16, length = dims[0] * dims[1] * dims[2]. */
  readonly voxels: Uint16Array;
  /** Coordinate frame the cube lives in.  Renderer maps this to world. */
  readonly frameKind: ScalarFieldFrameKind;
  /** Position of voxel (0,0,0) corner in `frameKind`'s coords, Mpc. */
  readonly origin: Vec3;
  /** Edge length of one cubic voxel in Mpc. */
  readonly voxelSize: number;
  /** Unit quaternion (x, y, z, w) applied in the native frame. */
  readonly rotation: Vec4;
  /** Diagnostic; only meaningful when the source data was raw, not pre-normalised. */
  readonly valueMin: number;
  readonly valueMax: number;
};
