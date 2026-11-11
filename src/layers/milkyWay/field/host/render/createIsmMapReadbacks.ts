/**
 * createIsmMapReadbacks — the two CPU copies of the ISM-map chain (the
 * generator's packed output and the orientation field), each with the
 * stream that fills it, over ONE `createReadbackQueue`. One queue is
 * load-bearing, not tidiness: two independent promise chains reintroduce the
 * 'buffer used in submit while mapped' race the queue exists to prevent.
 * Tokens stay per-stream so an orientation-only trigger (a sigma move)
 * cannot supersede a pending ismMap copy. Never a per-frame readback — these
 * land once per rebuild, and `dropIfGridMoved` is the only other writer.
 */

import type { GalaxyIsmMap } from '../../../../../@types/galaxy/GalaxyIsmMap';
import type { GalaxyIsmMapOrientation } from '../../ismMap/@types/GalaxyIsmMapOrientation';
import type { GalaxyIsmMapGridRadius } from '../../ismMap/@types/GalaxyIsmMapGridRadius';
import { ISM_MAP_RINGS } from '../../ismMap/data/ismMapRings';

import { createReadbackQueue } from './createReadbackQueue';
import { decodeOrientationTexels } from '../utils/decodeOrientationTexels';
import { decodeIsmMapTexels } from '../utils/decodeIsmMapTexels';
import type { IsmMapGenerator } from '../../ismMap/@types/IsmMapGenerator';
import type { IsmMapOrientation } from '../../ismMap/@types/IsmMapOrientation';
import { ISM_MAP_AZ } from '../../ismMap/data/ismMapAz';
import type { IsmMapReadbacks } from '../@types/IsmMapReadbacks';

export function createIsmMapReadbacks(deps: {
  readonly device: GPUDevice;
  readonly ismMapGenerator: IsmMapGenerator;
  readonly orientation: IsmMapOrientation;
}): IsmMapReadbacks {
  const queue = createReadbackQueue(deps.device);

  const ismMapStream = queue.stream({
    label: 'galaxy:ismMapReadback',
    texture: deps.ismMapGenerator.texture,
    buffer: deps.ismMapGenerator.readbackBuffer,
    bytesPerRow: deps.ismMapGenerator.readbackBytesPerRow,
    width: ISM_MAP_AZ,
    height: ISM_MAP_RINGS,
    decode: (mapped) =>
      decodeIsmMapTexels(
        new Uint16Array(mapped),
        deps.ismMapGenerator.readbackBytesPerRow,
        ISM_MAP_AZ,
        ISM_MAP_RINGS,
      ),
  });

  const orientationStream = queue.stream({
    label: 'galaxy:orientationReadback',
    texture: deps.orientation.texture,
    buffer: deps.orientation.readbackBuffer,
    bytesPerRow: deps.orientation.readbackBytesPerRow,
    width: ISM_MAP_AZ,
    height: ISM_MAP_RINGS,
    decode: (mapped) =>
      decodeOrientationTexels(
        new Uint16Array(mapped),
        deps.orientation.readbackBytesPerRow,
        ISM_MAP_AZ,
        ISM_MAP_RINGS,
      ),
  });

  const ringMeansStream = queue.bufferStream({
    label: 'galaxy:ringMeansReadback',
    sourceBuffer: deps.ismMapGenerator.ringMeansBuffer,
    buffer: deps.ismMapGenerator.ringMeansReadbackBuffer,
    size: ISM_MAP_RINGS * 4,
    // Copy out now — `mapped` is a view into the staging buffer's range,
    // invalid the instant the queue's own `unmap()` runs after this returns.
    decode: (mapped) => new Float32Array(mapped.slice(0)),
  });

  let ismMapData: GalaxyIsmMap | null = null;
  let orientationData: GalaxyIsmMapOrientation | null = null;

  const movedFrom = (
    cached: { readonly rMin: number; readonly rMax: number } | null,
    grid: GalaxyIsmMapGridRadius,
  ): boolean => cached !== null && (cached.rMin !== grid.rMin || cached.rMax !== grid.rMax);

  return {
    get ismMapData(): GalaxyIsmMap | null {
      return ismMapData;
    },
    get orientationData(): GalaxyIsmMapOrientation | null {
      return orientationData;
    },
    get orientationGeneration(): number {
      return orientationStream.generation;
    },

    requestIsmMap(grid, onLand): void {
      ismMapStream.request((data) => {
        ismMapData = {
          az: ISM_MAP_AZ,
          rings: ISM_MAP_RINGS,
          rMin: grid.rMin,
          rMax: grid.rMax,
          data,
        };
        onLand(ismMapData);
      });
    },

    requestOrientation(grid, onLand): void {
      orientationStream.request((data) => {
        orientationData = {
          az: ISM_MAP_AZ,
          rings: ISM_MAP_RINGS,
          rMin: grid.rMin,
          rMax: grid.rMax,
          data,
        };
        onLand(orientationData);
      });
    },

    dropIfGridMoved(grid): void {
      if (movedFrom(ismMapData, grid)) ismMapData = null;
      if (movedFrom(orientationData, grid)) orientationData = null;
    },

    requestRingMeans(onLand, onError): void {
      ringMeansStream.request(onLand, onError);
    },

    cancel: queue.cancel,
  };
}
