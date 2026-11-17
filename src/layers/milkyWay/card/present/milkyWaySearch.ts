/**
 * milkyWaySearch — the Layer's `search` feed: the one primary palette row for the
 * singleton, static, so it yields once. The id is the focus id the selection row
 * claims, which is what lets Enter on the row focus the Milky Way.
 */

import { MILKY_WAY_NAMES } from '../data/milkyWayNames';
import { MILKY_WAY_FOCUS_ID } from '../../../../services/url/milkyWayFocusId';
import type { LayerSearchEntry } from '../../../../@types/engine/layer/LayerSearchEntry';

export async function* milkyWaySearch(): AsyncIterable<readonly LayerSearchEntry[]> {
  yield [{ id: MILKY_WAY_FOCUS_ID, class: 'primary', names: MILKY_WAY_NAMES }];
}
