/**
 * wireStructureProjection — installs the two structure groups (curated
 * featured anchors + bulk catalog) into the `structureStore` as they arrive,
 * and emits per-category counts to the Structures panel.
 *
 * ### Group semantics and arrival schedule
 *
 *   - `anchors` — hand-curated cluster/SC/void anchors from
 *     `buildStaticAnchorPois`.  Published synchronously at boot so the
 *     Structures panel has counts from frame 1.
 *   - `bulk` — built from the cluster-catalog slot's ready value when it
 *     lands (a single subscription).  A slot error clears the group
 *     (graceful degradation — bulk structures don't appear but the engine
 *     continues normally).
 *
 * Famous galaxies are deliberately NOT wired here — they are galaxy data, and
 * `produceFamousLabels` derives their labels directly from `galaxyStore`
 * (catalog ⋈ famousMeta) per frame.  There is no structure-store famous group.
 *
 * ### Structure-count emissions
 *
 * After every group change we forward `{ cluster, supercluster, void }`
 * counts to `cb.sources?.onStructureCountsChange` so the Structures panel's
 * toggles can display "Clusters 573" alongside their checkboxes.  Counts are
 * read from `structureStore.byCategory` — the authoritative record set — so
 * the number matches exactly what will render.
 */

import { buildStaticAnchorPois } from '../../../data/buildStaticAnchorPois';
import { clusterCatalogToStructures } from '../phases/clusterCatalogToStructures';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';

/**
 * Wire the structure groups into the `structureStore`.
 *
 * Precondition: `state.assetSlots.clusterCatalog` is minted by `wireSlots`
 * before this function is called.
 */
export function wireStructureProjection(state: EngineState, cb: EngineCallbacks): void {
  /**
   * Emit fresh per-category structure counts after any group change.  Called
   * once at boot (static anchors) and again whenever the bulk group lands or
   * clears.  Counts are read from `structureStore.byCategory` so they reflect
   * the authoritative record set — the same one that renders.
   */
  function emitCounts(): void {
    cb.sources?.onStructureCountsChange?.({
      cluster: state.data.structures.byCategory('cluster').length,
      supercluster: state.data.structures.byCategory('supercluster').length,
      void: state.data.structures.byCategory('void').length,
    });
  }

  // ── Group 1: static anchors (synchronous) ───────────────────────────
  //
  // The id-slug + worldPos build lives in `data/buildStaticAnchorPois.ts`
  // so the React-side `usePoiUrlSync` deep-link drain constructs the same
  // records without drifting on slug-rule changes.  physicalRadiusMpc comes
  // from the seed JSON (R_200 / virial radii for clusters, characteristic
  // extent for superclusters and voids).
  state.data.structures.setGroup('anchors', buildStaticAnchorPois());
  emitCounts();

  // ── Group 2: bulk clusters/superclusters ─────────────────────────────
  //
  // The bulk records come straight off the cluster-catalog slot's ready
  // value.  A slot error clears the group (graceful degradation — bulk
  // structures don't appear but the engine continues normally).
  state.assetSlots.clusterCatalog?.subscribe((s) => {
    if (s.kind === 'ready') {
      state.data.structures.setGroup('bulk', clusterCatalogToStructures(s.value));
    } else if (s.kind === 'error') {
      state.data.structures.clearGroup('bulk');
    }
    emitCounts();
  });
}
