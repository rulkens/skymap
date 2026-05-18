import type { LabelProducer } from './LabelProducer';
import type { PoiCategory } from '../../../services/engine/subsystems/poiSubsystem';
import type { PointOfInterest } from './PointOfInterest';
import type { ClusterMarkerDescriptor } from '../../rendering/ClusterMarkerDescriptor';
import type { EngineState } from '../state/EngineState';
import type { ReadyFrameContext } from '../frame/ReadyFrameContext';

export type PoiSubsystem = LabelProducer & {
  setPois(pois: readonly PointOfInterest[]): void;
  clearPois(): void;
  setCategoryVisible(category: PoiCategory, visible: boolean): void;
  /**
   * Per-frame producer for the at-rest cluster / supercluster / void
   * markers (halo + ring).  Returns one descriptor per visible POI
   * after applying the apparent-size fade-in band AND the
   * max-apparent-radius fade-out.  Famous-galaxy POIs always return
   * empty (they render through the textured-impostor + label paths).
   *
   * The producer never mutates engine state directly — the returned
   * array is fed to `state.gpu.clusterMarkerRenderer.setMarkers(...)`
   * by `runFrame`.
   */
  produceMarkers(state: EngineState, ctx: ReadyFrameContext): readonly ClusterMarkerDescriptor[];
  /**
   * Mark a POI as selected (for focus mode).  The selected POI's
   * marker descriptor returns with its `ringAlpha` multiplied by 1.5
   * (capped at 1.0) so the user can visually distinguish the focused
   * POI from its neighbours; other POIs are unchanged.  Passing
   * `null` clears the selection.
   *
   * No-op when `poiId` doesn't match any POI currently in the
   * subsystem's table — defensive against deep-link drains that race
   * a tier swap, where a stale id would otherwise sit stranded with
   * no matching POI to highlight.
   */
  setSelectedPoi(poiId: string | null): void;
  /** Returns the currently-selected POI id, or `null` if none. */
  getSelectedPoiId(): string | null;
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
