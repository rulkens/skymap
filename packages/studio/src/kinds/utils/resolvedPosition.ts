/** A resolved look-at as the Resolved line: the `setVec` target, or empty for any other kind. */
import { formatPosition } from '../../utils/format/formatPosition';
import type { Effect } from '../../../../../src/@types/animation/Effect';

export function resolvedPosition(e: Effect): string {
  return e.kind === 'setVec' ? formatPosition(e.to) : '';
}
