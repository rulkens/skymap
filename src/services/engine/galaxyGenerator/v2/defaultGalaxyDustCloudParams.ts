import { SIZE_MIN_PC } from './dustParticleCloud';
import type { GalaxyDustCloudParams } from '../../../../@types/galaxy/GalaxyDustCloudParams';

// `count` and `elongation` are set against the covering factor, not by eye:
// see `dustParticleCloud.ts`'s size constants for the f = N*2*PI*elongation*
// <R^2> / A_disc relation these land near 3, where clouds still read
// individually but overlap enough along an arm to mottle it.
//
// Every refiner starts at its literature value (1.0).
export const DEFAULT_GALAXY_DUST_CLOUD_PARAMS: GalaxyDustCloudParams = {
  count: 6000,
  // 0 = independent scattering. The covering factor above is solved for
  // exactly that; clustering piles the same `count` into fewer complexes and
  // leaves the gaps between them uncovered.
  clumpiness: 0,
  sizeScale: 1,
  sizeFloorPc: SIZE_MIN_PC,
  elongation: 2.5,
  heightRatio: 0.5,
  texture: 0.7,
  textureScale: 1,
  textureContrast: 1,
};
