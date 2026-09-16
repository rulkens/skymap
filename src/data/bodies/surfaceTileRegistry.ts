/**
 * SURFACE_TILE_REGISTRY — the closed set of bodies `surfaceTileSubsystem` can
 * page a virtual texture for. Membership IS the predicate (`bodyId in
 * SURFACE_TILE_REGISTRY`) — `runFrame` never names a body literally on the
 * tile-planning path. One row (`earth`) until F4 adds Mars.
 */

import type { BodyId } from '../../@types/data/body/BodyId';
import type { SurfaceTileSpec } from '../../@types/data/SurfaceTileSpec';
import { EARTH_SURFACE_PARAMS } from './earthSurfaceParams';

export const SURFACE_TILE_REGISTRY = {
  earth: {
    manifestKey: 'earth-tiles',
    effects: ['materialMap', 'nightLights', 'cloudShadows'],
    // Picked fields, not the whole object: `EARTH_SURFACE_PARAMS` also carries
    // `cloudShadowStrength`/`ambientLight`/`oceanRoughness`, which stay live
    // user settings rather than a fixed per-body row (see Task 6).
    shading: {
      roughnessBase: EARTH_SURFACE_PARAMS.roughnessBase,
      f0: EARTH_SURFACE_PARAMS.f0,
      sunIrradiance: EARTH_SURFACE_PARAMS.sunIrradiance,
    },
  },
} as const satisfies Partial<Record<BodyId, SurfaceTileSpec>>;
