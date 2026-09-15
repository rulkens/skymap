/**
 * host body arm → site (spec §4.3), which IS the engage. The incoming basis is
 * DISCARDED — the rung looks at the site by construction — so deliberately
 * `fromParent(toParent(s))` is exact while `toParent(fromParent(b))` projects.
 */

import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
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
  hostRadiusM: number,
  body: MeshBody,
): SitePose {
  const p = sitePointBodyFixed(site, hostRadiusM);
  const { east, north, localUp } = siteEyeFrame(p);
  const eye = bodyFixedEyeM(arm);
  const rel = [eye[0] - p[0], eye[1] - p[1], eye[2] - p[2]] as const;
  const rangeM = Math.hypot(rel[0], rel[1], rel[2]);
  // An authored `distance: 0` reaches here through `decode`, and a NaN heading
  // never recovers — `clampedSitePose` floors the range, not the angles.
  const d = Math.max(rangeM, 1e-9);
  const dir = [rel[0] / d, rel[1] / d, rel[2] / d] as const;
  return clampedSitePose(
    {
      siteId: site.id as BodyId,
      headingRad: Math.atan2(dot3(dir, east), dot3(dir, north)),
      elevationRad: Math.asin(Math.min(1, Math.max(-1, dot3(dir, localUp)))),
      rangeM,
    },
    body,
  );
}
