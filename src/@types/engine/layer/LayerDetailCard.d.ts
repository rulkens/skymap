import type { DetailCardEntry } from '../../components/infoCard/DetailCardEntry';

/** The `detailCard` UI slot's content: the card pair for one kind the Layer owns, tagged with
 * that kind's `type`. `never` accepts a card typed on any Layer's own target. */
export type LayerDetailCard = { readonly type: string } & DetailCardEntry<never>;
