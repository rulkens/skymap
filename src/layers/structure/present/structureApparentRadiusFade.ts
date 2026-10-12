/**
 * structureApparentRadiusFade — the apparent-size fade a structure's ring and
 * its label share, so the two disappear together: smoothstep out as the ring
 * grows past `markerMaxApparentRadiusPx` (the cluster fills the view), and
 * smoothstep in across the band above `markerMinApparentRadiusPx` (no pop as
 * the camera pulls back). Radii are on-screen px.
 */

import { smoothstep } from '../../../utils/math/smoothstep';
import type { StructureMarkerStyle } from '../@types/StructureMarkerStyle';

export function structureApparentRadiusFade(
  style: Pick<
    StructureMarkerStyle,
    | 'markerMaxApparentRadiusPx'
    | 'markerMaxApparentFadeBandPx'
    | 'markerMinApparentRadiusPx'
    | 'markerMinApparentFadeBandPx'
  >,
  apparentRadiusPx: number,
): number {
  const max = style.markerMaxApparentRadiusPx;
  const min = style.markerMinApparentRadiusPx;
  const closeApproach =
    1 - smoothstep(max, max + style.markerMaxApparentFadeBandPx, apparentRadiusPx);
  const farDistance = smoothstep(min, min + style.markerMinApparentFadeBandPx, apparentRadiusPx);
  return Math.min(closeApproach, farDistance);
}
