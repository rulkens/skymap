/** A resolved look-at as the Resolved line: the `setVec` target, or empty for any other kind. */
import { formatVec3 } from './formatVec3';
import type { Effect } from '../../../../../src/@types/animation/Effect';

export function resolvedPosition(e: Effect): string {
  return e.kind === 'setVec' ? formatVec3(e.to, 'Mpc') : '';
}
