/**
 * host body arm → site (spec §4.3), which IS the engage. Range and elevation
 * come from the eye, the HEADING from the basis's right: the engage lands at
 * the remembered top-down tilt, where the eye's azimuth about the site is float
 * noise, while right stays horizontal at every tilt (it is `horiz × localUp`).
 */

import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { GroundRadiusLookup } from '../../@types/camera/GroundRadiusLookup';
import type { BodyId } from '../../@types/data/body/BodyId';
import type { MeshBody } from '../../@types/scene/MeshBody';
import type { SitePose } from '../../@types/camera/SitePose';
import type { SurfaceFixedSite } from '../../@types/scene/SurfaceFixedSite';
import { bodyFixedEyeM } from './bodyFixedEyeM';
import { clampedSitePose } from './clampedSitePose';
import { dot3 } from '../math/dot3';
import { siteEyeFrame } from './siteEyeFrame';
import { sitePointBodyFixed } from './sitePointBodyFixed';

export function sitePoseFromBodyArm(
  arm: BodyFixedPose,
  site: SurfaceFixedSite,
  groundRadiusAtM: GroundRadiusLookup,
  body: MeshBody,
): SitePose {
  const p = sitePointBodyFixed(site, groundRadiusAtM);
  const { east, north, localUp } = siteEyeFrame(p);
  const eye = bodyFixedEyeM(arm);
  const rel = [eye[0] - p[0], eye[1] - p[1], eye[2] - p[2]] as const;
  const rangeM = Math.hypot(rel[0], rel[1], rel[2]);
  // An authored `distance: 0` reaches here through `decode`, and a NaN heading
  // never recovers — `clampedSitePose` floors the range, not the angles.
  const d = Math.max(rangeM, 1e-9);
  const dir = [rel[0] / d, rel[1] / d, rel[2] / d] as const;
  const right = [arm.basisLocal[0], arm.basisLocal[1], arm.basisLocal[2]] as const;
  return clampedSitePose(
    {
      siteId: site.id as BodyId,
      // `canonicalBasisAt(frame, heading + π, …)` leaves right at
      // `sin(heading)·north − cos(heading)·east`, whatever the tilt.
      headingRad: Math.atan2(dot3(right, north), -dot3(right, east)),
      elevationRad: Math.asin(Math.min(1, Math.max(-1, dot3(dir, localUp)))),
      rangeM,
    },
    body,
  );
}
