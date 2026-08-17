/**
 * loadStateColorClass — the one `LoadState['kind']` → colour-class lookup, so a
 * busy asset panel scans by colour instead of by reading every row's text.
 *
 * Shared by the section header's filter tallies and each slot row's dot + kind
 * label. Kept out of both components because a second copy of the map is a
 * second place for a new `LoadState` variant to be forgotten.
 *
 * Non-null assertions: every key is declared in `loadStateColors.module.css`,
 * so the CSS-module index signature's `| undefined` (from
 * `noUncheckedIndexedAccess`) never actually happens.
 */

import type { LoadState } from '../../@types/loading/LoadState';
import colors from './loadStateColors.module.css';

const BY_KIND: Record<LoadState<unknown>['kind'], string> = {
  idle: colors.colorIdle!,
  loading: colors.colorLoading!,
  committing: colors.colorCommitting!,
  ready: colors.colorReady!,
  error: colors.colorError!,
};

export function loadStateColorClass(kind: LoadState<unknown>['kind']): string {
  return BY_KIND[kind];
}
