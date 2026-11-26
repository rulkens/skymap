/**
 * OutputProjection — how a view vector lands on the output image: the one
 * description every label projection reads, in TS (`projectLabel`) and WGSL
 * (`lib/projectLabel.wesl`). View space looks down +z with +y up and +x right,
 * so a pinhole sees `v.z > 0`. `outputProjectionOf` builds it per frame.
 */

import type { Mat3 } from '../math/Mat3';
import type { Vec2 } from '../../../packages/shared/src/@types/math/Vec2';
import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';

export type OutputProjection = {
  /** `'equidistant'` is the dome's fisheye: view space is then the dome frame, +y at the zenith. */
  readonly kind: 'pinhole' | 'equidistant';
  /** World → view, rotation only; the camera position travels as `camHi`/`camLo`. */
  readonly viewFromWorld: Mat3;
  /** The eye in world Mpc as an f32 hi/lo pair (`writeHiLoVertex`'s split). */
  readonly camHi: Vec3;
  readonly camLo: Vec3;
  /** The direction labels lift toward, in view space: view +y for a pinhole. */
  readonly up3: Vec3;
  readonly sizePx: Vec2;
  /** Where the view axis lands, in px; off the image centre under a lens shift. */
  readonly centrePx: Vec2;
  /** Pixels per radian on the view axis. */
  readonly focalPx: number;
  /** Multiplier for authored pixel constants (text sizes, gaps, bands): the device pixel ratio
   *  in mono, so they read as CSS px. */
  readonly pxScale: number;
};
