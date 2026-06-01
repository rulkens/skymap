import type { LabelProducer } from './LabelProducer';
import type { PoiCategory } from '../../../services/engine/subsystems/poiSubsystem';
import type { PointOfInterest } from './PointOfInterest';
import type { PoiGroupId } from './PoiGroupId';
import type { ClusterMarkerDescriptor } from '../../rendering/ClusterMarkerDescriptor';
import type { EngineState } from '../state/EngineState';
import type { ReadyFrameContext } from '../frame/ReadyFrameContext';

export type PoiSubsystem = LabelProducer & {
  /**
   * Store `pois` under `id`, replacing any previous content for that
   * group.  Groups merge in a fixed order — staticAnchors → famous →
   * clusterBulk — so each group's POIs cannot clobber another group's
   * regardless of call order.  A defensive copy is taken internally so
   * the caller may mutate their array freely after the call.
   */
  setGroup(id: PoiGroupId, pois: readonly PointOfInterest[]): void;
  /**
   * Remove the group `id` from the merged POI set.  Readers immediately
   * see a list that excludes the cleared group; other groups are
   * unaffected.
   */
  clearGroup(id: PoiGroupId): void;
  /**
   * Replace ALL groups with `pois` as the sole content of the
   * `staticAnchors` group, clearing `famous` and `clusterBulk`.
   *
   * Kept for backwards compatibility with call-sites that hand the
   * subsystem the full merged list in one shot (tests, older engine
   * code not yet migrated to per-group wiring).  New code should prefer
   * `setGroup` so groups don't clobber each other.
   */
  setPois(pois: readonly PointOfInterest[]): void;
  /**
   * Clear every group.  Symmetric counterpart to `setPois([])`.  Kept
   * alongside `setPois` so existing callers that pair them continue to
   * work without migration.
   */
  clearPois(): void;
  /**
   * Flip the MARKER (ring + halo) visibility for the given category.
   * Only consulted by `produceMarkers` — the text label for the same
   * category is unaffected and continues to render until
   * `setCategoryLabelVisible(cat, false)` is called.  See the module
   * header on `poiSubsystem.ts` for the two-axis split rationale.
   */
  setCategoryMarkerVisible(category: PoiCategory, visible: boolean): void;
  /**
   * Flip the LABEL (text annotation) visibility for the given
   * category.  Only consulted by `produceLabels` — the ring + halo
   * marker for the same category is unaffected.  See
   * `setCategoryMarkerVisible` for the symmetric setter.
   */
  setCategoryLabelVisible(category: PoiCategory, visible: boolean): void;
  /**
   * Per-frame producer for the at-rest cluster / supercluster / void
   * markers (halo + ring).  Returns one descriptor per marker-bearing
   * POI of a visible category — including ones faded fully out, which
   * emit at alpha 0 (discarded in-fragment) so the descriptor list stays
   * index-aligned with `getPoisForCategory` for the ring pick path.  The
   * apparent-size fade-in band and the close-approach / far-distance
   * fade-outs modulate the baked alpha rather than dropping descriptors.
   * Famous-galaxy POIs always return empty (they render through the
   * textured-disk + label paths).
   *
   * The producer never mutates engine state directly — the returned
   * array is fed to `state.gpu.clusterMarkerRenderer.setMarkers(...)`
   * by `runFrame`.
   */
  produceMarkers(state: EngineState, ctx: ReadyFrameContext): readonly ClusterMarkerDescriptor[];
  /**
   * Look up a POI by id, or null if it doesn't appear in the current
   * table.  Used by selectionSubsystem to expand a `{kind:'poi', id}`
   * Selection to the full PointOfInterest before firing
   * onHoverChange / onSelectChange.
   */
  findPoi(id: string): PointOfInterest | null;
  /**
   * Return the POIs of the given category in the subsystem's current
   * iteration order — i.e. the same order `produceMarkers` walks them
   * when it builds the per-frame descriptor list.
   *
   * Why this accessor exists: the ring pick fragment writes a per-
   * instance `poiIndex` that, once a single category's bucket is
   * isolated, is a 0-based index into "the Nth POI of this category
   * that produceMarkers emitted".  `produceMarkers` emits EXACTLY ONE
   * descriptor per marker-bearing POI of a visible category, in
   * `allPois()` order (staticAnchors → famous → clusterBulk) — including
   * faded-out POIs, which emit at alpha 0 and are discarded in-fragment
   * rather than omitted.  `setMarkers` groups by category preserving
   * within-group order.  Because no faded POI is dropped,
   * `getPoisForCategory(cat)[poiIndex]` resolves the same structure the
   * GPU picked — regardless of fade.  The contract holds as long as every
   * POI of a marker-bearing category sets a radius (current truth: all
   * clusters / superclusters / voids set physicalRadiusMpc); a
   * marker-category POI without a radius would emit no marker and break
   * the alignment.
   *
   * The contract is exercised by the pick-index-alignment test in
   * `poiSubsystem.test.ts` and is structurally guarded by the fact that
   * the renderer's per-category dispatch reads the same bucket-ordered
   * instance buffer the producer wrote.
   */
  getPoisForCategory(category: PoiCategory): readonly PointOfInterest[];
  /**
   * Tear down the subsystem.  No-op — the subsystem owns only plain-data
   * state (group map, visibility records); no listeners, timers, or
   * workers to release.  Method exists so the engine's subsystem bag can
   * be torn down uniformly via the shared `Destroyable` shape.
   */
  destroy(): void;
};
