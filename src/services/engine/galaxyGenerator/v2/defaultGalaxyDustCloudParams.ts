import type { GalaxyDustCloudParams } from '../../../../@types/galaxy/GalaxyDustCloudParams';

// Tuned by eye against the map-seeded placement. The covering factor that
// matters is count x <R^2> over the map's OCCUPIED area, not the whole disc;
// `elongation` sets aspect at full filament coherence, not coverage
// (area-preserving per particle — see dustParticleCloud.ts). Every refiner
// starts at its literature value (1.0).
export const DEFAULT_GALAXY_DUST_CLOUD_PARAMS: GalaxyDustCloudParams = {
  count: 6500,
  // 0 = independent scattering: child scatter around a CDF-placed seed
  // re-blurs the map-exact placement, so the tool doesn't expose a slider
  // for it (see DustCloudSection).
  clumpiness: 0,
  sizeScale: 1.8,
  sizeFloorPc: 30,
  elongation: 4.3,
  heightRatio: 0.5,
  texture: 0.45,
  textureScale: 1,
  textureContrast: 1,
  // The fluid map is now good enough that amplifying its detail reads as
  // structure, not noise.
  mapDetail: 0.45,
  dustPlacementCap: 2,
  carve: 0.45,
  carveSharpness: 0.5,
  carveStretch: 1.2,
};
