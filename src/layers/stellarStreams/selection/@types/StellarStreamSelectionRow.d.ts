import type { PlacedRow } from '../../../../@types/engine/selection/PlacedRow';
import type { RecedingFocusRow } from '../../../../@types/engine/selection/RecedingFocusRow';
import type { StellarStreamMeta } from '../../catalog/@types/StellarStreamMeta';

/**
 * The meta entry, placed (`positionMpc` its anchor, `radiusMpc` half its length), without the pick
 * geometry. Its focus region is `'subjectOnly'`: no sphere fits a long thin stream, and one would
 * leave the wrong galaxies and stars bright.
 */
export type StellarStreamSelectionRow = Omit<
  StellarStreamMeta,
  'anchorMpc' | 'centrelineMpc' | 'ribbonWidthKpc'
> &
  PlacedRow &
  RecedingFocusRow & { readonly type: 'stellarStream' };
