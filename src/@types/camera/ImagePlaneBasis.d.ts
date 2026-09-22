/**
 * ImagePlaneBasis — the camera's roll-adjusted up vector together with the
 * orthonormal screen right/up axes it induces.
 *
 * `computeViewProj` feeds `rolledUp` to `mat4.lookAt` as the up vector; the
 * screen `right`/`up` axes it induces ride along for any caller that needs
 * them. The shape exists so the Rodrigues roll convention lives in one place.
 *
 * `rolledUp` is kept alongside `right`/`up` (rather than being an internal
 * temporary) precisely because `computeViewProj` wants the raw rotated
 * up-vector, not the screen axes derived from it.
 */

import type { Vec3 } from '../math/Vec3';

/** The roll-adjusted up vector plus the screen right/up axes it induces. */
export type ImagePlaneBasis = {
  /** upRef rotated about forward by roll (raw Rodrigues; roll=0 ⇒ upRef exactly). */
  readonly rolledUp: Vec3;
  /** normalize(forward × rolledUp) — the screen-right axis, ||1-guarded. */
  readonly right: Vec3;
  /** normalize(right × forward) — the orthonormal image-plane up axis. */
  readonly up: Vec3;
};
