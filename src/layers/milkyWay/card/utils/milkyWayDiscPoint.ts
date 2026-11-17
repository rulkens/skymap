/**
 * milkyWayDiscPoint — a named place on the generated Milky Way, in the generator's
 * disc frame (+y the pole): on an arm's ridge at a radius, or at a polar place. An
 * arm point bends its radius by the lopsided mode after the angle, as
 * `generate.wesl`'s `armStarSample` does, so it lands on the arm the sprites draw.
 */

import type { Vec3 } from '../../../../@types/math/Vec3';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { AntiqueMilkyWayName } from '../../../../@types/rendering/AntiqueMilkyWayName';
import { MILKY_WAY_DISC_RADIUS_KPC } from '../../../../data/milkyWay/galacticCenter';
import { armRidgeAngle } from '../../field/arms/utils/armRidgeAngle';
import { warpHeight } from '../../field/mixture/utils/warpHeight';

export function milkyWayDiscPoint(
  at: AntiqueMilkyWayName['at'],
  geometry: GalaxyDescription,
): Vec3 {
  const r = (at.radiusKpc * geometry.outerRadius) / MILKY_WAY_DISC_RADIUS_KPC;
  let angle: number;
  let radius = r;
  if ('arm' in at) {
    angle = armRidgeAngle(Math.log(r / geometry.armStartRadius), geometry, geometry.arms[at.arm]!);
    radius = r * (1 + geometry.lopsidedAmp * Math.cos(angle - geometry.lopsidedAngle));
  } else {
    angle = (at.azimuthDeg * Math.PI) / 180;
  }
  return [radius * Math.cos(angle), warpHeight(radius, angle, geometry), radius * Math.sin(angle)];
}
