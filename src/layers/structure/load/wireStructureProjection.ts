/**
 * wireStructureProjection — fills the Layer's store with its two groups and
 * reports per-category counts and the palette's search list after each change.
 * `anchors` (curated, from `buildStaticAnchorStructures`) land synchronously so
 * the Structures panel has counts from frame 1; `bulk` lands off the catalog
 * slot, and a slot error clears it (bulk structures vanish, the engine runs on).
 * Counts read `store.byCategory`, the set that renders, and cover every
 * structure category: a missing one renders its toggle with no count. Famous
 * galaxies are galaxy data, labelled per frame from the galaxy store.
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

  function emitCounts(): void {
    dispatch(
      engineStructureCountsChanged(
        Object.fromEntries(STRUCTURE_IDS.map((id) => [id, store.byCategory(id).length])),
      ),
    );
    dispatch(engineStructureSearchListChanged(store.all().map(toStructureSearchEntry)));
  }

  // The id-slug build lives in `buildStaticAnchorStructures` so the
  // `${category}-${seed}` ids a `#focus=` deep link decodes to (the resolver's
  // `resolveFocusId`) cannot drift from the ids stored here.
  store.setGroup('anchors', buildStaticAnchorStructures());
  emitCounts();

  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      store.setGroup('bulk', structureCatalogToStructures(s.value));
    } else if (s.kind === 'error') {
      store.clearGroup('bulk');
    }
    emitCounts();
  });
}
