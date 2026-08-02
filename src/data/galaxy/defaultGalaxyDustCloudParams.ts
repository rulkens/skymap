import { SIZE_MIN_PC } from './dustParticleCloud';
import type { GalaxyDustCloudParams } from '../../@types/galaxy/GalaxyDustCloudParams';

// `count` and `elongation` are set against the covering factor, not by eye:
// see `dustParticleCloud.ts`'s size constants for the f = N*2*PI*elongation*
// <R^2> / A_disc relation these land near 3, where clouds still read
// individually but overlap enough along an arm to mottle it.
//
// The arm-lane group sits mid-to-low in its measured range rather than
// centred, and every refiner starts at its literature value (1.0).
export const DEFAULT_GALAXY_DUST_CLOUD_PARAMS: GalaxyDustCloudParams = {
  count: 6000,
  share: 0.6,
  armBias: 0.75,
  clumpiness: 0.6,
  sizeScale: 1,
  sizeFloorPc: SIZE_MIN_PC,
  elongation: 2.5,
  heightRatio: 0.5,
  bubbleCarve: 0.8,
  texture: 0.7,
  textureScale: 1,
  textureContrast: 1,
  armContrast: 3,
  sfActivity: 1,
  laneWidth: 1,
  laneOffset: 1,
  bubbleScale: 1,
  // 1, not a blend: anything below it leaves a (1 - w) pedestal that gas
  // multiplies into near-uniform dust, and gas is ~1 over most of a quiet
  // disc. At 0.7 the wake reads only ~1.6x the never-burnt background.
  sfMapSfWeight: 1,
};
