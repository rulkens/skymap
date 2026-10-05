/**
 * SURFACE_TILE_REGISTRY — the closed set of bodies `surfaceTileSubsystem` can
 * page a virtual texture for. Membership IS the predicate (`bodyId in
 * SURFACE_TILE_REGISTRY`) — `runFrame` never names a body literally on the
 * tile-planning path.
 */

import type { BodyTextureId } from '../../@types/data/BodyTextureId';
import type { SurfaceTileSpec } from '../../@types/data/SurfaceTileSpec';
import { EARTH_SURFACE_PARAMS } from './earthSurfaceParams';
import { MARS_SURFACE_SHADING } from './marsSurfaceParams';

export const SURFACE_TILE_REGISTRY = {
  earth: {
    manifestKey: 'earth-tiles',
    effects: ['materialMap', 'nightLights', 'cloudShadows'],
    // Picked fields, not the whole object: `EARTH_SURFACE_PARAMS` also carries
    // `cloudShadowStrength`/`ambientLight`/`oceanRoughness`, which stay live
    // user settings rather than a fixed per-body row.
    shading: {
      roughnessBase: EARTH_SURFACE_PARAMS.roughnessBase,
      f0: EARTH_SURFACE_PARAMS.f0,
      sunIrradiance: EARTH_SURFACE_PARAMS.sunIrradiance,
    },
  },
  mars: { manifestKey: 'mars-tiles', effects: [], shading: MARS_SURFACE_SHADING },
} as const satisfies Partial<Record<BodyTextureId, SurfaceTileSpec>>;
