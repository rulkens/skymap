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
   * Mark a POI as hovered (for the InfoCard hover preview).  Unlike
   * `setSelectedPoi`, the hovered POI has NO visual side effect: the
   * marker descriptor's `ringAlpha` is unchanged.  The id is captured
   * purely so the engine callback fan-out can drive the React-side
   * preview card; the ring itself never changes appearance on hover.
   *
   * The "no visual side effect" rule is the load-bearing contract of
   * the cluster-viz hover-preview plan (plan 5).  `produceMarkers`
   * never reads `hoveredPoiId`; the test
   * `poiSubsystem.hover.test.ts` "does NOT bump ringAlpha when only
   * hovered" is the regression guard.
   *
   * No-op when `poiId` doesn't match any POI currently in the
   * subsystem's table — same defensive contract as `setSelectedPoi`,
   * with the same tier-swap-race motivation.
   */
  setHoveredPoi(poiId: string | null): void;
  /** Returns the currently-hovered POI id, or `null` if none. */
  getHoveredPoiId(): string | null;
  /**
   * Return the POIs of the given category in the subsystem's current
   * iteration order — i.e. the same order `produceMarkers` walks them
   * when it builds the per-frame descriptor list.
   *
   * Why this accessor exists: the pick fragment writes a per-instance
   * `poiIndex` that decodes (via `selectionEncoding.unpackPick`) to
   * the GLOBAL slot in the per-frame instance buffer.  But once a
   * single category's bucket is isolated, that slot becomes a 0-based
   * index into "the Nth POI of this category that produceMarkers
   * uploaded".  Because `produceMarkers` iterates `pois` in array
   * order and packs descriptors in that order (then `setMarkers`
   * groups by category preserving within-group order), the array
   * `pois.filter(p => p.category === cat)` is the correct lookup
   * provided every POI of that category has a marker (current truth:
   * all clusters / superclusters / voids set physicalRadiusMpc).
   *
   * The contract is verified by the indexing comment in
   * `wireInput.ts`'s `resolvePoi` and is structurally guarded by the
   * fact that the renderer's per-category dispatch reads the same
   * bucket-ordered instance buffer the producer wrote.
   */
  getPoisForCategory(category: PoiCategory): readonly PointOfInterest[];
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
