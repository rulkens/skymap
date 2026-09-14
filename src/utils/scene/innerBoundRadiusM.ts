import type { BodySurface } from '../../@types/scene/BodySurface';

/** innerBoundRadiusM — an occluder must under-occlude: never hide what a valley leaves visible. */
export function innerBoundRadiusM(surface: BodySurface): number {
  return surface.datumRadiusM + surface.reliefM[0];
}
