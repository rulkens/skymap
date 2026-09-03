/**
 * createIsmMapChain — the ISM-map generator and the eight GPU stages that hang
 * off it, built in dependency order (the orientation and ring-reduce stages
 * bind the generator's own texture/buffers) and torn down in reverse by the one
 * `dispose`. Each sub-factory owns every resource it touches, including its
 * readback staging buffers; this bundle keeps only the handles.
 */

import {
  ISM_MAP_AZ,
  ISM_MAP_RINGS,
} from '../../../../engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import { createIsmMapDustCdfScan } from './createIsmMapDustCdfScan';
import type { IsmMapDustCdfScan } from './createIsmMapDustCdfScan';
import { createIsmMapGenerator } from './createIsmMapGenerator';
import type { IsmMapGenerator } from './createIsmMapGenerator';
import { createIsmMapOrientation } from './createIsmMapOrientation';
import type { IsmMapOrientation } from './createIsmMapOrientation';
import { createIsmMapPlaceArmCloud } from './createIsmMapPlaceArmCloud';
import type { IsmMapPlaceArmCloud } from './createIsmMapPlaceArmCloud';
import { createIsmMapPlaceArmSpurCloud } from './createIsmMapPlaceArmSpurCloud';
import type { IsmMapPlaceArmSpurCloud } from './createIsmMapPlaceArmSpurCloud';
import { createIsmMapPlaceDigVeil } from './createIsmMapPlaceDigVeil';
import type { IsmMapPlaceDigVeil } from './createIsmMapPlaceDigVeil';
import { createIsmMapPlaceDust } from './createIsmMapPlaceDust';
import type { IsmMapPlaceDust } from './createIsmMapPlaceDust';
import { createIsmMapRingReduce } from './createIsmMapRingReduce';
import type { IsmMapRingReduce } from './createIsmMapRingReduce';

export type IsmMapChain = {
  readonly generator: IsmMapGenerator;
  readonly orientation: IsmMapOrientation;
  readonly ringReduce: IsmMapRingReduce;
  readonly dustCdfScan: IsmMapDustCdfScan;
  readonly digCdfScan: IsmMapDustCdfScan;
  readonly placeDust: IsmMapPlaceDust;
  readonly placeArmSpurCloud: IsmMapPlaceArmSpurCloud;
  readonly placeArmCloud: IsmMapPlaceArmCloud;
  readonly placeDigVeil: IsmMapPlaceDigVeil;
  dispose(): void;
};

export function createIsmMapChain(
  device: GPUDevice,
  deps: {
    readonly makeShader: (code: string, label: string) => GPUShaderModule;
    readonly hdrFormat: GPUTextureFormat;
    readonly fieldUbo: GPUBuffer;
  },
): IsmMapChain {
  const { makeShader, hdrFormat, fieldUbo } = deps;

  const generator = createIsmMapGenerator(device, { makeShader, hdrFormat, fieldUbo });
  const orientation = createIsmMapOrientation(device, {
    makeShader,
    hdrFormat,
    fieldUbo,
    sourceTexture: generator.texture,
  });
  // GPU replacement for `ismMapRingMeans.ts`'s CPU loop — see its own header.
  const ringReduce = createIsmMapRingReduce(device, {
    makeShader,
    ismMapTexture: generator.texture,
    ringMeansBuffer: generator.ringMeansBuffer,
  });
  // GPU replacement for `buildIsmMapDustCdf.ts`'s CPU prefix sum.
  const dustCdfScan = createIsmMapDustCdfScan(device, {
    makeShader,
    maxRings: ISM_MAP_RINGS,
    maxAz: ISM_MAP_AZ,
  });
  // A SECOND instance of the same factory, at the same ceiling — the DIG
  // veil's own arm-biased weight table. Its OWN buffer, never sharing
  // `dustCdfScan`'s: dust's and DIG's placement dispatches are each deferred
  // independently to `stepIsmMap()`, so one shared `prefixBuffer` would let
  // whichever dispatch runs second silently overwrite the first's input.
  const digCdfScan = createIsmMapDustCdfScan(device, {
    makeShader,
    maxRings: ISM_MAP_RINGS,
    maxAz: ISM_MAP_AZ,
  });
  // GPU replacement for `buildDustParticleCloud`'s map-seeded placement.
  const placeDust = createIsmMapPlaceDust(device, { makeShader });
  // GPU replacement for `buildArmSpurParticleCloud`'s placement body.
  const placeArmSpurCloud = createIsmMapPlaceArmSpurCloud(device, { makeShader });
  // GPU replacement for `buildArmParticleCloud`'s placement body.
  const placeArmCloud = createIsmMapPlaceArmCloud(device, { makeShader });
  // GPU replacement for `buildDigVeil`'s complex/children placement.
  const placeDigVeil = createIsmMapPlaceDigVeil(device, { makeShader });

  const parts = [
    generator,
    orientation,
    ringReduce,
    dustCdfScan,
    digCdfScan,
    placeDust,
    placeArmSpurCloud,
    placeArmCloud,
    placeDigVeil,
  ];

  return {
    generator,
    orientation,
    ringReduce,
    dustCdfScan,
    digCdfScan,
    placeDust,
    placeArmSpurCloud,
    placeArmCloud,
    placeDigVeil,
    dispose(): void {
      for (let i = parts.length - 1; i >= 0; i--) parts[i]!.dispose();
    },
  };
}
