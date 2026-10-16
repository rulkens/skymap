/**
 * expandVisibilityLayers — the one expansion of the cue helpers' `'labels'` aggregate: every
 * label address `APP_VISIBILITY` declares, in its order. Expanded at effect construction, so
 * a stored effect, the settings write and the clip channel only ever see atomic addresses.
 * Derived from the entries, a new Layer's label joins `hide(['labels'])` with no edit here.
 */

import type { LabelAddress } from '../../@types/animation/LabelAddress';
import { APP_VISIBILITY } from '../../compositions/appVisibility';
import { visibilityAddressOf } from '../visibility/visibilityAddressOf';

const LABEL_ADDRESSES = APP_VISIBILITY.filter((entry) => 'label' in entry).map(
  (entry) => visibilityAddressOf(entry) as LabelAddress,
);

export function expandVisibilityLayers<A extends string>(
  args: readonly (A | 'labels')[],
): (Exclude<A, 'labels'> | LabelAddress)[] {
  return args.flatMap<Exclude<A, 'labels'> | LabelAddress>((arg) =>
    arg === 'labels' ? LABEL_ADDRESSES : [arg as Exclude<A, 'labels'>],
  );
}
