import type { LabelProducer } from './LabelProducer';
import type { PoiCategory } from '../../../services/engine/subsystems/poiSubsystem';
import type { PointOfInterest } from './PointOfInterest';
import type { ClusterMarkerDescriptor } from '../../rendering/ClusterMarkerDescriptor';
import type { EngineState } from '../state/EngineState';
import type { ReadyFrameContext } from '../frame/ReadyFrameContext';

export type PoiSubsystem = LabelProducer & {
  setPois(pois: readonly PointOfInterest[]): void;
  clearPois(): void;
  /**
   * Flip the MARKER (ring + halo) visibility for the given category.
   * Only consulted by `produceMarkers` — the text label for the same
   * category is unaffected and continues to render until
   * `setCategoryLabelVisible(cat, false)` is called.
   *
   * The two-axis split landed with the 2026-05-19 settings-panel audit
   * (Q11) — see the module header on `poiSubsystem.ts` for the
   * conflation bug this fix addresses.
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
   * markers (halo + ring).  Returns one descriptor per visible POI
   * after applying the apparent-size fade-in band AND the
   * max-apparent-radius fade-out.  Famous-galaxy POIs always return
   * empty (they render through the textured-disk + label paths).
   *
   * The producer never mutates engine state directly — the returned
   * array is fed to `state.gpu.clusterMarkerRenderer.setMarkers(...)`
   * by `runFrame`.
   */
  produceMarkers(state: EngineState, ctx: ReadyFrameContext): readonly ClusterMarkerDescriptor[];
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
