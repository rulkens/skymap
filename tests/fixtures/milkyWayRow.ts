/** The Milky Way's selection row, as its Layer's `extractRow` builds it. */

import { milkyWaySelectionRow } from '../../src/layers/milkyWay/selection/milkyWaySelectionRow';
import type { SelectionRowBase } from '../../src/@types/engine/selection/SelectionRowBase';

export const MILKY_WAY_ROW: SelectionRowBase = milkyWaySelectionRow(0).extractRow(
  { type: 'milkyWay' },
  0,
)!;
