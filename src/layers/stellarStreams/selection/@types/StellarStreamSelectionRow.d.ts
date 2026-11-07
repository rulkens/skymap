import type { PlacedRow } from '../../../../@types/engine/selection/PlacedRow';
import type { RecedingFocusRow } from '../../../../@types/engine/selection/RecedingFocusRow';
import type { StellarStreamMeta } from '../../catalog/@types/StellarStreamMeta';

/**
 * The meta entry, placed: `positionMpc` is its anchor, `radiusMpc` half its length. Its focus
 * recedes the rest with no sphere: none fits a long thin stream, and one would dim the wrong stars.
 */
export type StellarStreamSelectionRow = Omit<StellarStreamMeta, 'anchorMpc'> &
  PlacedRow &
  RecedingFocusRow & { readonly type: 'stellarStream'; readonly focusSphere: null };
