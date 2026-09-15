/**
 * The site rung's gesture register (spec §4.6): one turntable drag at the body
 * arm's 1:1 GROUND rate — a pixel spans `rangeM · fovY / heightPx` metres of the
 * site's bounding sphere, which is that over the sphere's radius in radians —
 * capped by the flat `ORBIT_MAX_RAD_PER_PX`, as `orbitRadPerPixel` caps the same
 * law. Both signs are that arm's ORBIT handle re-derived, never its tilt.
 */

import type { InputStep } from '../../@types/camera/InputStep';
import type { MeshBody } from '../../@types/scene/MeshBody';
import type { SitePose } from '../../@types/camera/SitePose';
import type { Vec2 } from '../../@types/math/Vec2';
import { clampedSitePose } from './clampedSitePose';
import { ORBIT_MAX_RAD_PER_PX } from './orbitRadPerPixel';
import { spentZoomFactor } from './spentZoomFactor';
import { wrapRad } from '../math/wrapRad';

export function steppedSitePose(
  pose: SitePose,
  input: InputStep,
  body: MeshBody,
  viewportPx: Readonly<Vec2>,
  fovYRad: number,
): SitePose {
  if (input.kind === 'drag') {
    const gain = Math.min(
      ORBIT_MAX_RAD_PER_PX,
      ((fovYRad / viewportPx[1]) * pose.rangeM) / body.boundingRadiusM,
    );
    return clampedSitePose(
      {
        ...pose,
        headingRad: wrapRad(pose.headingRad + (input.endPx[0] - input.startPx[0]) * gain),
        elevationRad: pose.elevationRad + (input.endPx[1] - input.startPx[1]) * gain,
      },
      body,
    );
  }
  // No cursor anchoring: the turntable's pivot is the site, by definition.
  if (input.kind === 'zoom') {
    return clampedSitePose({ ...pose, rangeM: pose.rangeM * spentZoomFactor(input.factor) }, body);
  }
  // The gesture edges move nothing, and an arithmetic identity is not an
  // identity for the full-pose byte bar.
  return pose;
}
