import type { BodySurface } from '../../@types/scene/BodySurface';

/** outerBoundRadiusM — over-estimating wastes screen area, under-estimating clips a peak. */
export function outerBoundRadiusM(surface: BodySurface): number {
  return surface.datumRadiusM + surface.reliefM[1];
}
