import type { PlacedRow } from '../../../../@types/engine/selection/PlacedRow';
import type { StellarStreamMeta } from '../../catalog/@types/StellarStreamMeta';

/** The meta entry, placed: `positionMpc` is its anchor, `radiusMpc` half its length. */
export type StellarStreamSelectionRow = Omit<StellarStreamMeta, 'anchorMpc'> &
  PlacedRow & { readonly type: 'stellarStream' };
