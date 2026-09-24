import type { SelectionKind } from '../SelectionKind';
import type { DetailCardEntry } from '../../components/infoCard/DetailCardEntry';

/** The `detailCard` UI slot's content: a Layer's own FocusableTarget arm,
 * tagged by the union discriminant `detailCardTable` dispatches on — one
 * member per `SelectionKind`, its `DetailCardEntry` typed to that same arm. */
export type LayerDetailCard = {
  [K in SelectionKind]: { readonly type: K } & DetailCardEntry<K>;
}[SelectionKind];
