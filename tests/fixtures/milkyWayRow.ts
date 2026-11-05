/** The Milky Way's selection row, as its Layer's `extractRow` builds it. */

import { milkyWaySelectionRow } from '../../src/layers/milkyWay/card/present/milkyWaySelectionRow';
import type { SelectionRow } from '../../src/@types/engine/SelectionRow';

export const MILKY_WAY_ROW: SelectionRow = milkyWaySelectionRow(0).extractRow(
  { type: 'milkyWay' },
  0,
)!;
