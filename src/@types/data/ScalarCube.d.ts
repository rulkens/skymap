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
 *
 * Why `velocityStats`:  the SCFD header carries a `value_kind` byte
 * discriminating *what* a cube holds.  `value_kind = 0` is a pre-normalised
 * scalar density (`channels === 1`, `velocityStats` absent).  `value_kind = 1`
 * is a velocity + overdensity vector field (`channels === 4`): each voxel is
 * (vx, vy, vz, δ).  Such a field needs runtime-normalisation stats a generic
 * per-channel min/max can't express — velocity magnitude is a *cross-channel*
 * quantity, not the range of any one component.  Those stats fold into the
 * header's reserved region (no JSON sidecar) and surface here as the optional
 * `velocityStats` companion.  Its presence on the cube is the in-memory mirror
 * of `value_kind === 1`; the encoder rejects it on any cube whose
 * `channels !== 4` (a plain 4-channel cube may still omit it — it then encodes
 * as `value_kind = 0`).
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
  /**
   * Diagnostic; only meaningful when the source data was raw, not pre-normalised.
   * For a velocity field (`channels === 4`, `velocityStats` present) these
   * double as the δ (overdensity) range — δ is the scalar companion of the
   * vector, so it reuses the existing value-range slots rather than minting
   * a fourth stat.
   */
  readonly valueMin: number;
  readonly valueMax: number;
  /**
   * Present only on a 4-channel velocity + overdensity field (`value_kind = 1`);
   * a plain `channels === 4` cube may omit it. The encoder rejects velocityStats
   * on any non-4-channel cube.
   * Velocity-magnitude + δ percentiles the flow renderer uses to normalise
   * particle speed and seeding weight. deltaMin/deltaMax are carried by
   * valueMin/valueMax; these are the three stats those slots can't express
   * (speed is a cross-channel magnitude, not a per-channel range).
   */
  readonly velocityStats?: {
    readonly speedKmsMax: number;
    readonly speedKmsP99: number;
    readonly deltaP99: number;
  };
};
