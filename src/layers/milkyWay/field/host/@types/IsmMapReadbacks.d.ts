import type { GalaxyIsmMap } from '../../../../../@types/galaxy/GalaxyIsmMap';
import type { GalaxyIsmMapOrientation } from '../../ismMap/@types/GalaxyIsmMapOrientation';
import type { GalaxyIsmMapGridRadius } from '../../ismMap/@types/GalaxyIsmMapGridRadius';

export type IsmMapReadbacks = {
  /** Null until the first copy lands, and again whenever `dropIfGridMoved` invalidates it. */
  readonly ismMapData: GalaxyIsmMap | null;
  readonly orientationData: GalaxyIsmMapOrientation | null;
  /** The orientation stream's request count — the diagnostics readout's `generation`. */
  readonly orientationGeneration: number;
  /** `onLand` runs once the cache holds the copy, and only if no later request superseded it. */
  requestIsmMap(grid: GalaxyIsmMapGridRadius, onLand: (value: GalaxyIsmMap) => void): void;
  requestOrientation(
    grid: GalaxyIsmMapGridRadius,
    onLand: (value: GalaxyIsmMapOrientation) => void,
  ): void;
  /** Content one rebuild stale over the SAME grid is kept: dropping it made a slider drag flip the dust each frame. */
  dropIfGridMoved(grid: GalaxyIsmMapGridRadius): void;
  /** Debug-only, for the probe's CPU-vs-GPU ring-means check; `onError` because its awaiter is a Promise. */
  requestRingMeans(onLand: (means: Float32Array) => void, onError?: (err: unknown) => void): void;
  /** Terminal, before the renderer that owns the staging buffers is disposed. */
  cancel(): void;
};
