import type { StructureInfo } from '../../../@types/data/structure/StructureInfo';
import type { StructureMarkerStyle } from '../@types/StructureMarkerStyle';

/**
 * The radius a structure's ring draws at: its apparent extent, floored at the
 * style's `pointRadiusPx` on screen for a point (a planet host, a transient),
 * whose seed radius is far too small to see from afar. A region has no floor, so it fades
 * out when too small to read; a point stays findable at every zoom.
 */
export function structureMarkerRadiusMpc(
  s: StructureInfo,
  style: StructureMarkerStyle,
  distanceMpc: number,
  pxPerRad: number,
): number {
  const radiusMpc = s.apparentRadiusMpc ?? s.physicalRadiusMpc;
  if (style.pointRadiusPx === undefined || distanceMpc <= 0) return radiusMpc;
  return Math.max(radiusMpc, (style.pointRadiusPx * distanceMpc) / pxPerRad);
}
