/**
 * ViewProjection — how an output image's pixels map to world directions: a
 * pinhole (`rectilinear`, the flat view) or the dome master's equidistant
 * `fisheye`. One value handed to everything that places or casts per pixel, so
 * nothing downstream branches on the rig; `rayOfPx` / `pxOfRay` read it.
 */

import type { Mat3 } from '../../math/Mat3';
import type { Vec2 } from '../../math/Vec2';
import type { Size } from '../../rendering/Size';
import type { ViewBasis } from './ViewBasis';
import type { ViewFrustum } from './ViewFrustum';

export type ViewProjection =
  | {
      readonly kind: 'rectilinear';
      readonly basis: ViewBasis;
      readonly frustum: ViewFrustum;
      readonly size: Size;
    }
  | {
      readonly kind: 'fisheye';
      /** World-from-dome rotation: columns are the dome's right, zenith and front in world axes. */
      readonly basis: Readonly<Mat3>;
      /** The zenith's pixel and the horizon circle's radius, device px. */
      readonly centrePx: Readonly<Vec2>;
      readonly radiusPx: number;
      readonly size: Size;
    };
