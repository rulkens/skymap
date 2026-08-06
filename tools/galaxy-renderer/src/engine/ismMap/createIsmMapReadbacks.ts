/**
 * createSfMapReadbacks — the two CPU copies of the SF-map chain (the packed
 * generator output — automaton OR fluid, whichever `sfMap.generator` names —
 * and the orientation field), each with the stream that fills it, over ONE
 * `createReadbackQueue`.
 *
 * One queue is load-bearing, not tidiness: two independent promise chains
 * reintroduce the 'buffer used in submit while mapped' race that queue exists
 * to prevent. Tokens stay per-stream so an orientation-only trigger (a sigma
 * move) cannot supersede a pending sfMap copy.
 *
 * Never a per-frame readback and never a CPU mirror of the generator — these
 * land once per rebuild, and `dropIfGridMoved` is the only other writer.
 */

import type { GalaxySfMap } from '../../../../../src/@types/galaxy/GalaxyIsmMap';
import type { GalaxySfMapOrientation } from '../../../../../src/@types/galaxy/GalaxyIsmMapOrientation';
import type { GalaxySfMapGridRadius } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import {
  SF_MAP_AZ,
  SF_MAP_RINGS,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';

import { createReadbackQueue } from '../gpu/createReadbackQueue';
import { decodeOrientationTexels } from './decodeOrientationTexels';
import { decodeSfMapTexels } from './decodeIsmMapTexels';
import type { SfMapGenerator } from './createIsmMapGenerator';
import type { SfMapOrientation } from './createIsmMapOrientation';

export type SfMapReadbacks = {
  /** Null until the first copy lands, and again whenever `dropIfGridMoved` invalidates it. */
  readonly sfMapData: GalaxySfMap | null;
  readonly orientationData: GalaxySfMapOrientation | null;
  /** The orientation stream's request count — the diagnostics readout's `generation`. */
  readonly orientationGeneration: number;
  /**
   * Copy the automaton's texture as it stands, tagged with the grid it was
   * written over. `onLand` runs after the cache holds the result, and only if
   * no later request superseded this one.
   */
  requestSfMap(grid: GalaxySfMapGridRadius, onLand: (value: GalaxySfMap) => void): void;
  requestOrientation(
    grid: GalaxySfMapGridRadius,
    onLand: (value: GalaxySfMapOrientation) => void,
  ): void;
  /**
   * Discard whichever cache was sampled over a grid that has since moved.
   * Registration is what a cached map has to be right about — `rMin`/`rMax`
   * ride the readback for exactly this check — so content that is one rebuild
   * stale over the SAME grid is kept. Dropping unconditionally instead made a
   * slider DRAG flip the dust between its map-seeded and unseeded builds once
   * per frame.
   */
  dropIfGridMoved(grid: GalaxySfMapGridRadius): void;
};

export function createSfMapReadbacks(deps: {
  readonly device: GPUDevice;
  readonly sfMapGenerator: SfMapGenerator;
  readonly orientation: SfMapOrientation;
}): SfMapReadbacks {
  const queue = createReadbackQueue(deps.device);

  const sfMapStream = queue.stream({
    label: 'galaxy:sfMapReadback',
    texture: deps.sfMapGenerator.texture,
    buffer: deps.sfMapGenerator.readbackBuffer,
    bytesPerRow: deps.sfMapGenerator.readbackBytesPerRow,
    width: SF_MAP_AZ,
    height: SF_MAP_RINGS,
    decode: (mapped) =>
      decodeSfMapTexels(
        new Uint16Array(mapped),
        deps.sfMapGenerator.readbackBytesPerRow,
        SF_MAP_AZ,
        SF_MAP_RINGS,
      ),
  });

  const orientationStream = queue.stream({
    label: 'galaxy:orientationReadback',
    texture: deps.orientation.texture,
    buffer: deps.orientation.readbackBuffer,
    bytesPerRow: deps.orientation.readbackBytesPerRow,
    width: SF_MAP_AZ,
    height: SF_MAP_RINGS,
    decode: (mapped) =>
      decodeOrientationTexels(
        new Uint16Array(mapped),
        deps.orientation.readbackBytesPerRow,
        SF_MAP_AZ,
        SF_MAP_RINGS,
      ),
  });

  let sfMapData: GalaxySfMap | null = null;
  let orientationData: GalaxySfMapOrientation | null = null;

  const movedFrom = (
    cached: { readonly rMin: number; readonly rMax: number } | null,
    grid: GalaxySfMapGridRadius,
  ): boolean => cached !== null && (cached.rMin !== grid.rMin || cached.rMax !== grid.rMax);

  return {
    get sfMapData(): GalaxySfMap | null {
      return sfMapData;
    },
    get orientationData(): GalaxySfMapOrientation | null {
      return orientationData;
    },
    get orientationGeneration(): number {
      return orientationStream.generation;
    },

    requestSfMap(grid, onLand): void {
      sfMapStream.request((data) => {
        sfMapData = { az: SF_MAP_AZ, rings: SF_MAP_RINGS, rMin: grid.rMin, rMax: grid.rMax, data };
        onLand(sfMapData);
      });
    },

    requestOrientation(grid, onLand): void {
      orientationStream.request((data) => {
        orientationData = {
          az: SF_MAP_AZ,
          rings: SF_MAP_RINGS,
          rMin: grid.rMin,
          rMax: grid.rMax,
          data,
        };
        onLand(orientationData);
      });
    },

    dropIfGridMoved(grid): void {
      if (movedFrom(sfMapData, grid)) sfMapData = null;
      if (movedFrom(orientationData, grid)) orientationData = null;
    },
  };
}
