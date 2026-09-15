/**
 * SURFACE_TILE_REGISTRY — the closed set of bodies `surfaceTileSubsystem` can
 * page a virtual texture for. Membership IS the predicate (`bodyId in
 * SURFACE_TILE_REGISTRY`) — `runFrame` never names a body literally on the
 * tile-planning path. One row (`earth`) until F4 adds Mars.
 */

import type { BodyId } from '../../@types/data/body/BodyId';
import type { SurfaceTileSpec } from '../../@types/data/SurfaceTileSpec';

export const SURFACE_TILE_REGISTRY = {
  earth: { manifestKey: 'earth-tiles' },
} as const satisfies Partial<Record<BodyId, SurfaceTileSpec>>;
