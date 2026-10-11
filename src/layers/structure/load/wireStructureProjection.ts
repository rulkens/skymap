/**
 * wireStructureProjection — fills the Layer's store with its two groups and
 * publishes per-category counts with the bulk slot's status. `anchors` (from
 * `buildStaticAnchorStructures`) land synchronously, so counts exist from frame
 * 1 with `bulk: 'idle'`. `bulk` lands off the catalog slot: loading/committing
 * publish `'loading'`, ready/error write or clear the group and THEN publish
 * counts, and a release publishes `'idle'` (a slot nobody demands must not
 * hold a focus deferral). Counts read `store.byCategory`, the set that renders,
 * over every structure category: a missing one renders its toggle countless.
 */

import { STRUCTURE_IDS } from '../../../data/structure/structureIds';
import { buildStaticAnchorStructures } from './buildStaticAnchorStructures';
import { structureCatalogToStructures } from './structureCatalogToStructures';
import { engineStructureSearchListChanged } from '../../../state/engine/engineSlice';
import { toStructureSearchEntry } from './toStructureSearchEntry';

import type { LayerCoreDeps } from '../../../@types/engine/layer/LayerCoreDeps';
import type { StructureFacts } from '../@types/StructureFacts';
import type { StructureRuntime } from '../@types/StructureRuntime';

export function wireStructureProjection(
  runtime: Pick<StructureRuntime, 'store' | 'slot'>,
  publish: (patch: Partial<StructureFacts>) => void,
  dispatch: LayerCoreDeps['store']['dispatch'],
): void {
  const { store, slot } = runtime;

  function publishCounts(bulk: StructureFacts['bulk']): void {
    publish({
      counts: Object.fromEntries(STRUCTURE_IDS.map((id) => [id, store.byCategory(id).length])),
      bulk,
    });
    dispatch(engineStructureSearchListChanged(store.all().map(toStructureSearchEntry)));
  }

  // The id-slug build lives in `buildStaticAnchorStructures` so the
  // `${category}-${seed}` ids a `#focus=` deep link decodes to (the resolver's
  // `resolveFocusId`) cannot drift from the ids stored here.
  store.setGroup('anchors', buildStaticAnchorStructures());
  publishCounts('idle');

  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      store.setGroup('bulk', structureCatalogToStructures(s.value));
      publishCounts('ready');
    } else if (s.kind === 'error') {
      store.clearGroup('bulk');
      publishCounts('error');
    } else {
      publish({ bulk: s.kind === 'idle' ? 'idle' : 'loading' });
    }
  });
}
