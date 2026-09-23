import type { FocusableTargetType } from '../FocusableTargetType';
import type { DetailCardEntry } from '../../components/infoCard/DetailCardEntry';

/** The `detailCard` UI slot's content: a Layer's own FocusableTarget arm,
 * tagged by the union discriminant `detailCardTable` dispatches on. */
export type LayerDetailCard = { readonly type: FocusableTargetType } & DetailCardEntry;
