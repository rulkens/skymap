/**
 * The site's ENU at P, as an `EyeFrame`: up is the host radial, east/north the
 * pure body ENU (`blendedEnuAt` at w = 1, whose degenerate branch covers a polar
 * site). `tiltRad`/`azimuthRad` are unread by `canonicalBasisAt`, hence 0.
 */

import type { EyeFrame } from '../../@types/camera/EyeFrame';
import type { Vec3 } from '../../@types/math/Vec3';
import { BODY_LOCAL_FRAME } from '../../data/camera/bodyLocalFrame';
import { blendedEnuAt } from './blendedEnuAt';
import { normalize3 } from '../math/normalize3';

export function siteEyeFrame(pointBodyFixed: Readonly<Vec3>): EyeFrame {
  const localUp = normalize3(pointBodyFixed);
  const { east, north } = blendedEnuAt(localUp, 1, BODY_LOCAL_FRAME.pole, null);
  return { localUp, east, north, tiltRad: 0, azimuthRad: 0 };
}
