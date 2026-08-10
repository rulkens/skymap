/**
 * FieldCamera — the analytic field pass's view of the camera: a ray origin
 * plus the terms `packFieldHeaderUniforms` turns into a world-space ray per
 * fragment. See that packer's header for why a BASIS rather than an inverse
 * view-projection.
 */

import type { Vec3 } from '../../../../src/@types/math/Vec3';

export type FieldCamera = {
  /** Camera world position — the ray origin. */
  readonly eye: Vec3;
  /** View matrix, 16 floats column-major; the basis is read off its rotation rows. */
  readonly view: Float32Array;
  /** Vertical field of view in radians, as handed to `mat4.perspective`. */
  readonly fov: number;
  /** Viewport aspect the PROJECTION was built with, not the pass's own target. */
  readonly aspect: number;
  /** The value written into `proj[8]`. */
  readonly lensShiftX: number;
  /** Whole-field intensity multiplier — the tool's one look knob for this pass. */
  readonly exposure: number;
};
