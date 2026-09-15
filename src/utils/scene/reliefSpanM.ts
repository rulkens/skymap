import type { BodySurface } from '../../@types/scene/BodySurface';

/** reliefSpanM — the widest gap any height-level seam can open on this body:
 *  no lattice, however coarse, can miss the true surface by more than the
 *  whole interval the surface spans against its datum. */
export function reliefSpanM(surface: BodySurface): number {
  return surface.reliefM[1] - surface.reliefM[0];
}
