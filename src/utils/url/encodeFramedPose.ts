/**
 * encodeFramedPose — serialize a `FramedCameraPose` as one comma-joined
 * hash-param value, one leading arm-kind tag (`decodeFramedPose` is the
 * inverse): `b,<bodyId>,<anchorLocalM×3>,<eyeRelAnchorM×3>,<basisLocal×9>` ·
 * `s,<siteId>,<headingRad>,<elevationRad>,<rangeM>` ·
 * `a,<target×3>,<yaw>,<pitch>,<distance>,<roll>`. `String(n)` throughout —
 * never `toFixed` — so a metre-scale altitude round-trips exactly.
 */

import type { FramedCameraPose } from '../../@types/camera/FramedCameraPose';
import { isBodyArm } from '../../services/engine/camera/rungs/isBodyArm';
import { isSiteArm } from '../../services/engine/camera/rungs/isSiteArm';

export function encodeFramedPose(framed: FramedCameraPose): string {
  if (isBodyArm(framed)) {
    const { bodyId, anchorLocalM, eyeRelAnchorM, basisLocal } = framed.pose;
    return ['b', bodyId, ...anchorLocalM, ...eyeRelAnchorM, ...basisLocal].map(String).join(',');
  }
  if (isSiteArm(framed)) {
    const { siteId, headingRad, elevationRad, rangeM } = framed.pose;
    return ['s', siteId, headingRad, elevationRad, rangeM].map(String).join(',');
  }
  const { target, yaw, pitch, distance, roll } = framed.pose;
  return ['a', ...target, yaw, pitch, distance, roll ?? 0].map(String).join(',');
}
