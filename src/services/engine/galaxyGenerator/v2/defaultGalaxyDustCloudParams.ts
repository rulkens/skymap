import type { GalaxyDustCloudParams } from '../../../../@types/galaxy/GalaxyDustCloudParams';

// Tuned by eye against the S1/S3 map-seeded placement (2026-08-05 visual
// pass). The covering factor that matters is count x <R^2> over the map's
// OCCUPIED area, not the whole disc, and `elongation` no longer buys
// coverage — it is the aspect at full filament coherence, area-preserving
// per particle (see dustParticleCloud.ts).
//
// Every refiner starts at its literature value (1.0).
export const DEFAULT_GALAXY_DUST_CLOUD_PARAMS: GalaxyDustCloudParams = {
  count: 5000,
  // 0 = independent scattering: child scatter around a CDF-placed seed
  // re-blurs the map-exact placement, so the tool no longer exposes a
  // slider for it (see DustCloudSection).
  clumpiness: 0,
  sizeScale: 1.8,
  sizeFloorPc: 30,
  elongation: 4.3,
  heightRatio: 0.5,
  texture: 0.45,
  textureScale: 1,
  textureContrast: 1,
  // Off while the automaton is being improved — the term amplifies whatever
  // the map shows.
  mapDetail: 0,
  // 0 = uncapped — today's behaviour.
  dustPlacementCap: 0,
};
