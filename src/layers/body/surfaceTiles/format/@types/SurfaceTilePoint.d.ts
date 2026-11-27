import type { Vec2 } from '../../../../../../packages/shared/src/@types/math/Vec2';

/** A body-fixed direction placed on level z's tile grid: the tile, and the point's uv inside it
 *  in the patch's convention (`vertex.wesl`'s `out.uv`): u east from the west edge, v south from
 *  the north edge, both 0…1. */
export type SurfaceTilePoint = {
  readonly x: number;
  readonly y: number;
  readonly uv: Vec2;
};
