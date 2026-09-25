/**
 * blackHoleSearch — the Layer's `search` feed: one primary palette row per hole,
 * static, so it yields once. The row id is the focus id the selection row
 * decodes, which is what lets Enter on the row select and frame the hole.
 */

import { BLACK_HOLE_SOURCE_ROWS } from '../sources/blackHoleSourceRows';
import { SGR_A_STAR_ENTRY } from '../sources/sgrAStar';
import { encodeBlackHoleFocusId } from './encodeBlackHoleFocusId';
import type { BlackHoleId } from '../../../@types/data/blackHole/BlackHoleId';
import type { LayerSearchEntry } from '../../../@types/engine/layer/LayerSearchEntry';

// A query matches a NAME verbatim, not a normalised form, so the American
// spelling and the designation's spellings are listed beside the registry names.
const SEARCH_ALIASES: Readonly<Record<BlackHoleId, readonly string[]>> = {
  [SGR_A_STAR_ENTRY.id]: ['Galactic Center', 'Sgr A*', 'SgrA*'],
};

export async function* blackHoleSearch(): AsyncIterable<readonly LayerSearchEntry[]> {
  yield BLACK_HOLE_SOURCE_ROWS.map(([, entry]) => ({
    id: encodeBlackHoleFocusId(entry.id),
    class: 'primary' as const,
    names: [entry.label, entry.detailLabel, ...SEARCH_ALIASES[entry.id]],
  }));
}
