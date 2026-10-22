/**
 * pooledSelectedPackedOf — the selection halo's packed id for the octree pipelines: a
 * pool row, which a catalog ordinal maps to only while its chunk is resident.
 */

import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { GalaxyPooledPointRenderer } from '../@types/GalaxyPooledPointRenderer';
import { packSelection, SELECTION_NONE_SENTINEL } from '../../../data/selectionEncoding';

export function pooledSelectedPackedOf(
  pooled: Pick<GalaxyPooledPointRenderer, 'poolRecordIndex'>,
  select: SelectionRef | null,
): number {
  if (select === null || select.type !== 'galaxyCatalog') return SELECTION_NONE_SENTINEL;
  const row = pooled.poolRecordIndex(select.source, select.index);
  return row === null ? SELECTION_NONE_SENTINEL : packSelection(select.source, row);
}
