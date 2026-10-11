/**
 * wireStructureProjection — installs the two structure groups (curated
 * featured anchors + bulk catalog) into the Layer's structure store as they
 * arrive, and emits per-category counts to the Structures panel.
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
 * `produceFamousGalaxyLabels` derives their labels per frame from the catalog
 * and the meta sidecar, both held by the galaxy store.  There is no
 * structure-store famous group.
 *
 * ### Structure-count dispatches
 *
 * After every group change we dispatch `engineStructureCountsChanged` with
 * `{ cluster, supercluster, void, group }` counts so the Structures panel's
 * toggles can display "Clusters 573" alongside their checkboxes.  Counts are
 * read from `store.byCategory` — the authoritative record set — so
 * the number matches exactly what will render.  Every structure category MUST
 * appear here; a missing one renders its toggle with no count (the bug that
 * left `group` countless until it was added).
 */

import { STRUCTURE_IDS } from '../../../data/structure/structureIds';
import { buildStaticAnchorStructures } from './buildStaticAnchorStructures';
import { structureCatalogToStructures } from './structureCatalogToStructures';
import {
  engineStructureCountsChanged,
  engineStructureSearchListChanged,
} from '../../../state/engine/engineSlice';
import { toStructureSearchEntry } from './toStructureSearchEntry';

import type { LayerCoreDeps } from '../../../@types/engine/layer/LayerCoreDeps';
import type { StructureRuntime } from '../@types/StructureRuntime';

export function wireStructureProjection(
  runtime: Pick<StructureRuntime, 'store' | 'slot'>,
  dispatch: LayerCoreDeps['store']['dispatch'],
): void {
  const { store, slot } = runtime;

  /**
   * Emit fresh per-category structure counts AND the command palette's search
   * list after any group change.  Called once at boot (static anchors) and
   * again whenever the bulk group lands or clears.  Both reads go through
   * the store so they reflect the authoritative record set — the same
   * one that renders.
   */
  function emitCounts(): void {
    dispatch(
      engineStructureCountsChanged(
        Object.fromEntries(STRUCTURE_IDS.map((id) => [id, store.byCategory(id).length])),
      ),
    );
    dispatch(engineStructureSearchListChanged(store.all().map(toStructureSearchEntry)));
  }

  // ── Group 1: static anchors (synchronous) ───────────────────────────
  //
  // The id-slug + worldPos build lives in `data/buildStaticAnchorStructures.ts`
  // so the `${category}-${seed}` ids a `#focus=` deep link decodes to (see the
  // resolver's `resolveFocusId`) cannot drift from the ids stored here.  physicalRadiusMpc
  // comes from the seed JSON (R_200 / virial radii for clusters, characteristic
  // extent for superclusters and voids).
  store.setGroup('anchors', buildStaticAnchorStructures());
  emitCounts();

  // ── Group 2: bulk clusters/superclusters ─────────────────────────────
  //
  // The bulk records come straight off the structure-catalog slot's ready
  // value.  A slot error clears the group (graceful degradation — bulk
  // structures don't appear but the engine continues normally).
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      store.setGroup('bulk', structureCatalogToStructures(s.value));
    } else if (s.kind === 'error') {
      store.clearGroup('bulk');
    }
    emitCounts();
  });
}
