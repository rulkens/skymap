/**
 * wireStructureProjection — installs the two structure groups (curated
 * featured anchors + bulk catalog) into the `structureStore` as they arrive,
 * and emits per-category counts to the Structures panel.
 *
 * ### Group semantics and arrival schedule
 *
 *   - `anchors` — hand-curated cluster/SC/void anchors from
 *     `buildStaticAnchorStructures`.  Published synchronously at boot so the
 *     Structures panel has counts from frame 1.
 *   - `bulk` — built from the structure-catalog slot's ready value when it
 *     lands (a single subscription).  A slot error clears the group
 *     (graceful degradation — bulk structures don't appear but the engine
 *     continues normally).
 *
 * Famous galaxies are deliberately NOT wired here — they are galaxy data, and
 * `produceFamousGalaxyLabels` derives their labels per frame from the catalog in
 * `galaxyStore` joined with the famous-galaxies meta sidecar (the engine
 * slice, via `state.famousGalaxiesMeta`).  There is no structure-store famous
 * group.
 *
 * ### Structure-count dispatches
 *
 * After every group change we dispatch `engineStructureCountsChanged` with
 * `{ cluster, supercluster, void, group }` counts so the Structures panel's
 * toggles can display "Clusters 573" alongside their checkboxes.  Counts are
 * read from `structureStore.byCategory` — the authoritative record set — so
 * the number matches exactly what will render.  Every structure category MUST
 * appear here; a missing one renders its toggle with no count (the bug that
 * left `group` countless until it was added).
 */

import { buildStaticAnchorStructures } from '../../../data/structure/buildStaticAnchorStructures';
import { structureCatalogToStructures } from './structureCatalogToStructures';
import { engineStructureCountsChanged } from '../../../state/engine/engineSlice';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';

/**
 * Wire the structure groups into the `structureStore`.
 *
 * Precondition: `state.assetSlots.structureCatalog` is minted by `wireSlots`
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
    cb.store.dispatch(
      engineStructureCountsChanged({
        cluster: state.data.structures.byCategory('cluster').length,
        supercluster: state.data.structures.byCategory('supercluster').length,
        void: state.data.structures.byCategory('void').length,
        group: state.data.structures.byCategory('group').length,
      }),
    );
  }

  // ── Group 1: static anchors (synchronous) ───────────────────────────
  //
  // The id-slug + worldPos build lives in `data/buildStaticAnchorStructures.ts`
  // so the `${category}-${seed}` ids a `#focus=` deep link decodes to (see
  // `resolveFocusId`) cannot drift from the ids stored here.  physicalRadiusMpc
  // comes from the seed JSON (R_200 / virial radii for clusters, characteristic
  // extent for superclusters and voids).
  state.data.structures.setGroup('anchors', buildStaticAnchorStructures());
  emitCounts();

  // ── Group 2: bulk clusters/superclusters ─────────────────────────────
  //
  // The bulk records come straight off the structure-catalog slot's ready
  // value.  A slot error clears the group (graceful degradation — bulk
  // structures don't appear but the engine continues normally).
  state.assetSlots.structureCatalog?.subscribe((s) => {
    if (s.kind === 'ready') {
      state.data.structures.setGroup('bulk', structureCatalogToStructures(s.value));
    } else if (s.kind === 'error') {
      state.data.structures.clearGroup('bulk');
    }
    emitCounts();
  });
}
