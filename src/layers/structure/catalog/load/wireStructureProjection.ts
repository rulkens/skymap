/**
 * wireStructureProjection — fills the Layer's store with its two groups and
 * publishes counts + search list with the bulk slot's status. `anchors` (from
 * `buildStaticAnchorStructures`) land synchronously, so both exist from frame 1
 * with `bulk: 'idle'`. `bulk` lands off the catalog slot: loading/committing
 * publish `'loading'`; ready writes the group, error and idle clear it, each
 * THEN publishing counts. Idle (a release, or a cancel with nothing committed)
 * must neither keep released records rendering nor hold a focus deferral.
 * Both read the store, the set that renders; counts
 * cover every structure category, as a missing one renders its toggle countless.
 */

import { STRUCTURE_IDS } from '../../../../data/structure/structureIds';
import { buildStaticAnchorStructures } from './buildStaticAnchorStructures';
import { structureCatalogToStructures } from './structureCatalogToStructures';
import { toStructureSearchEntry } from './toStructureSearchEntry';

import type { StructureFacts } from '../../@types/StructureFacts';
import type { StructureRuntime } from '../../@types/StructureRuntime';

export function wireStructureProjection(
  runtime: Pick<StructureRuntime, 'store' | 'slot'>,
  publish: (patch: Partial<StructureFacts>) => void,
): void {
  const { store, slot } = runtime;

  function publishStore(bulk: StructureFacts['bulk']): void {
    publish({
      counts: Object.fromEntries(STRUCTURE_IDS.map((id) => [id, store.byCategory(id).length])),
      searchList: store.all().map(toStructureSearchEntry),
      bulk,
    });
  }

  // The id-slug build lives in `buildStaticAnchorStructures` so the
  // `${category}-${seed}` ids a `#focus=` deep link decodes to (the resolver's
  // `resolveFocusId`) cannot drift from the ids stored here.
  store.setGroup('anchors', buildStaticAnchorStructures());
  publishStore('idle');

  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      store.setGroup('bulk', structureCatalogToStructures(s.value));
      publishStore('ready');
    } else if (s.kind === 'error' || s.kind === 'idle') {
      store.clearGroup('bulk');
      publishStore(s.kind);
    } else {
      publish({ bulk: 'loading' });
    }
  });
}
