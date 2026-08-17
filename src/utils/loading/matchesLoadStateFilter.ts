/**
 * matchesLoadStateFilter — does a slot's lifecycle kind survive the panel's
 * header filter?
 *
 * `inFlight` needs its own check rather than a straight `===` because it is the
 * header's fold of `loading` + `committing`, not a `LoadState['kind']` of its
 * own.
 */

import type { LoadState } from '../../@types/loading/LoadState';
import type { LoadStateFilter } from '../../@types/loading/LoadStateFilter';

export function matchesLoadStateFilter(
  filter: LoadStateFilter,
  kind: LoadState<unknown>['kind'],
): boolean {
  if (filter === null) return true;
  if (filter === 'inFlight') return kind === 'loading' || kind === 'committing';
  return kind === filter;
}
