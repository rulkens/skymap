/**
 * structureApparentRadiusFade — the apparent-size fade of a structure's ring: smoothstep out as
 * the ring grows past `markerMaxApparentRadiusPx` (the cluster fills the view), and smoothstep in
 * across the band above `markerMinApparentRadiusPx` (no pop as the camera pulls back). The
 * radius is device px; the min threshold and band are CSS px (× `dpr`) so the ring comes in
 * where its label's `appear` band does (the label reads a diameter: half the label's px).
 */

import { smoothstep } from '../../../../utils/math/smoothstep';
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
  dpr: number,
): number {
  const max = style.markerMaxApparentRadiusPx;
  const min = style.markerMinApparentRadiusPx * dpr;
  const closeApproach =
    1 - smoothstep(max, max + style.markerMaxApparentFadeBandPx, apparentRadiusPx);
  const farDistance = smoothstep(
    min,
    min + style.markerMinApparentFadeBandPx * dpr,
    apparentRadiusPx,
  );
  return Math.min(closeApproach, farDistance);
}
