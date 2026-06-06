/**
 * FlowFieldMeta — frame + normalisation stats for a velocity flow field,
 * derived from a decoded `ScalarCube` (SCFD v3, `value_kind = 1`).
 *
 * This is the metadata half of the `FlowField` GPU handle: everything the
 * renderer needs to place the cube in world space and to normalise particle
 * speed / seeding weight, *without* re-touching the voxel bytes.  It mirrors
 * the cube's geometry fields one-for-one (`n`, `origin`, `voxelSizeMpc`,
 * `frameKind`) plus the value range (`deltaMin`/`deltaMax`, which the SCFD
 * format overloads to mean the overdensity δ range on a velocity field) and
 * the three cross-channel velocity stats the per-channel range can't express.
 *
 * Why a derived meta type rather than passing the whole cube around:  once the
 * voxels are uploaded to the GPU the CPU-side `Uint16Array` is dead weight,
 * and the renderer only ever reads these scalar fields.  Splitting the small
 * self-describing meta off the cube lets the loader drop the voxel buffer for
 * GC while keeping the frame + stats alive on the `FlowField` handle.  The
 * earlier cosmic-flow tool sourced these from a JSON sidecar; the SCFD v3
 * format folds them into the header, so the loader reads them straight off the
 * decoded cube — no second fetch, no `boxMpcPerH`.
 */

import type { Vec3 } from '../math/Vec3';
import type { ScalarFieldFrameKind } from './ScalarFieldFrameKind';

export type FlowFieldMeta = {
  /** Cube edge length in voxels; the cube is N³ (`dims[0]`). */
  readonly n: number;
  /** SG-cartesian Mpc position of the cube's lower (0,0,0) corner. */
  readonly origin: Vec3;
  /** Edge length of one cubic voxel in Mpc. */
  readonly voxelSizeMpc: number;
  /** Coordinate frame the cube lives in; renderer maps it to world. */
  readonly frameKind: ScalarFieldFrameKind;
  /** Overdensity δ range (the SCFD value-range slots on a velocity field). */
  readonly deltaMin: number;
  readonly deltaMax: number;
  /** Peak velocity magnitude in km/s. */
  readonly speedKmsMax: number;
  /** 99th-percentile velocity magnitude in km/s (robust normalisation). */
  readonly speedKmsP99: number;
  /** 99th-percentile overdensity δ (seeding-weight normalisation). */
  readonly deltaP99: number;
};
