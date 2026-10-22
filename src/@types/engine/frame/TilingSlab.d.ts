import type { SurfaceTileBodyId } from '../../data/SurfaceTileBodyId';
import type { Slab } from './Slab';
import type { SlabFrame } from './SlabFrame';

/** A body-slab row whose host is a `SURFACE_TILE_REGISTRY` body. */
export type TilingSlab = Slab & {
  frame: Extract<SlabFrame, { kind: 'body-m' }> & { hostId: SurfaceTileBodyId };
};
