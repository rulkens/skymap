/**
 * encodeBlackHoleFocusId — a black hole's `#focus=` id. Shared by the selection
 * row's `focusId.encode` and the search row's id, so the palette, the deep link
 * and the resolver can never spell it two ways.
 */

import { BLACK_HOLE_FOCUS_PREFIX } from './blackHoleFocusPrefix';
import type { BlackHoleId } from '../../../@types/data/blackHole/BlackHoleId';

export function encodeBlackHoleFocusId(id: BlackHoleId): string {
  return `${BLACK_HOLE_FOCUS_PREFIX}${id}`;
}
