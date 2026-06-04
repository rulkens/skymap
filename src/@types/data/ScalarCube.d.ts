/**
 * ScalarCube — runtime form of a `SCFD` v3 binary.
 *
 * Shape after decoding:  the `voxels` array is x-fastest, then y, then z,
 * matching the on-disk byte order.  All metadata fields are decoded into
 * native JS numbers so downstream code never re-parses the header.
 *
 * Why a `f16` Uint16Array on the JS side:  WebGPU's `r16float` /
 * `rgba16float` 3D texture upload accepts the raw 2-byte representation
 * directly; we store it as `Uint16Array` so the decoder can `set()` the
 * bytes without per-element conversion.  The shader sees full f16
 * precision; the CPU side never materialises floats unless a test
 * specifically asks (and the synthetic builder writes them out via a
 * small float→f16 helper).
 *
 * Why `channels`:  v3 generalised the format from scalar-only (1 component
 * per voxel) to also carry 4-component fields — e.g. an rgba16float flow /
 * velocity cube where each voxel holds a vector + magnitude.  The component
 * count is data, not presentation, so it rides on the cube and drives the
 * voxel-array length (`channels` f16 values per cell) and the GPU texture
 * format.  The alternative — a separate sidecar or a second cube type —
 * would fork every loader/encoder path; one self-describing field keeps the
 * single decode/encode contract.
 */

import type { Vec3 } from '../math/Vec3';
import type { Vec4 } from '../math/Vec4';
import type { ScalarFieldFrameKind } from './ScalarFieldFrameKind';

export type ScalarCube = {
  /** Voxel grid dimensions; x-fastest. */
  readonly dims: Vec3;
  /**
   * Voxel components per cell: 1 → `r16float` scalar, 4 → `rgba16float`
   * vector.  These are the only two values v3 admits.
   */
  readonly channels: 1 | 4;
  /**
   * Raw f16 voxels as Uint16,
   * length = dims[0] * dims[1] * dims[2] * channels (interleaved per cell).
   */
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
