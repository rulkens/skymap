import type { GalaxyIsmMap } from '../../../../../@types/galaxy/GalaxyIsmMap';
import type { GalaxyIsmMapOrientation } from '../../ismMap/@types/GalaxyIsmMapOrientation';
import type { GalaxyIsmMapGridRadius } from '../../ismMap/@types/GalaxyIsmMapGridRadius';

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
   * (`ismMapPresent.wesl`) never leaves the GPU. `onError`: this is the one
   * `request()` caller in this file with an external awaiter (the probe's
   * Promise-wrapped `GalaxyEngineHandle['probe'].requestRingMeansReadback`) — see
   * `createReadbackQueue.ts`'s own doc for why that needs a reject path the
   * other two (fire-and-forget cache updates) don't.
   */
  requestRingMeans(onLand: (means: Float32Array) => void, onError?: (err: unknown) => void): void;
};
