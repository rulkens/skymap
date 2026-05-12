import type { LabelProducer } from './LabelProducer';
import type { PoiCategory } from './PoiCategory';
import type { PointOfInterest } from './PointOfInterest';

export type PoiSubsystem = LabelProducer & {
  setPois(pois: readonly PointOfInterest[]): void;
  clearPois(): void;
  setCategoryVisible(category: PoiCategory, visible: boolean): void;
  /**
   * Tear down the subsystem.  No-op — the subsystem owns only
   * plain-data state (pois list, visibility record); there are no
   * listeners, timers, or workers to release.  Method exists so the
   * engine's bag of subsystems can be torn down uniformly via the
   * shared `Destroyable` shape (`engine.destroy()` iterates and calls
   * `destroy()` on each).
   */
  destroy(): void;
};
