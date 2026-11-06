/**
 * detailCardTable — folds every Layer's `detailCard` ui-slot contribution into the
 * `DetailCardTable` InfoCard dispatches on. Called once at module load (`InfoCard.tsx`), so a
 * composed selection kind with no card throws at boot, naming the kind.
 */

import type { Layer } from '../../@types/engine/layer/Layer';
import type { DetailCardTable } from '../../@types/components/infoCard/DetailCardTable';
import type { DetailCardEntry } from '../../@types/components/infoCard/DetailCardEntry';
import { layerUiContents } from '../../utils/layer/layerUiContents';
import { layerSelectionKinds } from '../../utils/layer/layerSelectionKinds';

export function detailCardTable(layers: readonly Layer<string, unknown>[]): DetailCardTable {
  const table = new Map<string, DetailCardEntry>();
  for (const { type, ...entry } of layerUiContents(layers, 'detailCard')) {
    // A card is typed on its own Layer's target; the table holds it base-typed, and
    // `detailCardFor` only ever hands it a target of the `type` it is keyed by.
    table.set(type, entry as DetailCardEntry);
  }
  const missing = layerSelectionKinds(layers)
    .map((kind) => kind.type)
    .filter((type) => !table.has(type));
  if (missing.length > 0) {
    throw new Error(`detailCardTable: no detailCard for "${missing.join(', ')}"`);
  }
  return table;
}
