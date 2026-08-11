/**
 * createIsmMapReadbacks — the two CPU copies of the ISM-map chain (the
 * generator's packed output and the orientation field), each with the
 * stream that fills it, over ONE `createReadbackQueue`. One queue is
 * load-bearing, not tidiness: two independent promise chains reintroduce
 * the 'buffer used in submit while mapped' race the queue exists to
 * prevent. Tokens stay per-stream so an orientation-only trigger (a sigma
 * move) cannot supersede a pending ismMap copy. Never a per-frame readback
 * — these land once per rebuild, and `dropIfGridMoved` is the only other
 * writer.
 */

import type { GalaxyIsmMap } from '../../../../../src/@types/galaxy/GalaxyIsmMap';
import type { GalaxyIsmMapOrientation } from '../../../../../src/@types/galaxy/GalaxyIsmMapOrientation';
import type { GalaxyIsmMapGridRadius } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import {
  ISM_MAP_AZ,
  ISM_MAP_RINGS,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';

import { createReadbackQueue } from '../gpu/createReadbackQueue';
import { decodeOrientationTexels } from './decodeOrientationTexels';
import { decodeIsmMapTexels } from './decodeIsmMapTexels';
import type { IsmMapGenerator } from './createIsmMapGenerator';
import type { IsmMapOrientation } from './createIsmMapOrientation';

export type IsmMapReadbacks = {
  /** Null until the first copy lands, and again whenever `dropIfGridMoved` invalidates it. */
  readonly ismMapData: GalaxyIsmMap | null;
  readonly orientationData: GalaxyIsmMapOrientation | null;
  /** The orientation stream's request count — the diagnostics readout's `generation`. */
  readonly orientationGeneration: number;
  /**
   * Copy the generator's texture as it stands, tagged with the grid it was
   * written over. `onLand` runs after the cache holds the result, and only if
   * no later request superseded this one.
   */
  requestIsmMap(grid: GalaxyIsmMapGridRadius, onLand: (value: GalaxyIsmMap) => void): void;
  requestOrientation(
    grid: GalaxyIsmMapGridRadius,
    onLand: (value: GalaxyIsmMapOrientation) => void,
  ): void;
  /**
   * Discard whichever cache was sampled over a grid that has since moved.
   * Registration is what a cached map has to be right about — `rMin`/`rMax`
   * ride the readback for exactly this check — so content that is one rebuild
   * stale over the SAME grid is kept. Dropping unconditionally instead made a
   * slider DRAG flip the dust between its map-seeded and unseeded builds once
   * per frame.
   */
  dropIfGridMoved(grid: GalaxyIsmMapGridRadius): void;
  /**
   * Debug-only: map `ismMapGenerator.ringMeansBuffer` back to the CPU — the
   * GPU twin of `ismMapRingMeans.ts`'s CPU loop, off the SAME `queue` chain
   * (via `bufferStream`, not `stream` — the source is a plain STORAGE buffer,
   * not a texture). Used by the probe's numeric-readback check
   * (`probeGpuErrors.ts`) to confirm the two agree within float tolerance —
   * no production caller, since the fluid path's own consumer of this buffer
   * (`ismMapPresent.wesl`) never leaves the GPU.
   */
  requestRingMeans(onLand: (means: Float32Array) => void): void;
};

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

    requestRingMeans(onLand): void {
      ringMeansStream.request(onLand);
    },
  };
}
