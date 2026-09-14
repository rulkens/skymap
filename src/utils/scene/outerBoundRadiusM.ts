import type { BodySurface } from '../../@types/scene/BodySurface';

/**
 * outerBoundRadiusM — the radius no point of the surface rises above, metres.
 * The currency for extents (footprint, framing, near plane, LOD, caption em):
 * over-estimating only wastes a little screen area, under-estimating clips a peak.
 */
export function outerBoundRadiusM(surface: BodySurface): number {
  return surface.datumRadiusM + surface.reliefM[1];
}
