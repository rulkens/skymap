import type { BodySurface } from '../../@types/scene/BodySurface';

/**
 * innerBoundRadiusM — the radius no point of the surface falls below, metres.
 * The currency for occluders and an atmosphere's ground, where under-estimating
 * is the safe direction: an occluder must never hide what a valley leaves visible.
 */
export function innerBoundRadiusM(surface: BodySurface): number {
  return surface.datumRadiusM + surface.reliefM[0];
}
