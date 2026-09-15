/**
 * The site rung's gesture register (spec §4.6): one drag mode, the turntable.
 * The rate is the angle the pixel delta subtends at the lens — the body arm's
 * law, so no tuning constant exists to be wrong. Both signs are that arm's
 * ORBIT handle re-derived, not its tilt handle; do not "fix" them toward it.
 */

import type { InputStep } from '../../@types/camera/InputStep';
import type { MeshBody } from '../../@types/scene/MeshBody';
import type { SitePose } from '../../@types/camera/SitePose';
import type { Vec2 } from '../../@types/math/Vec2';
import { clampedSitePose } from './clampedSitePose';
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
    const gain = fovYRad / viewportPx[1];
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
