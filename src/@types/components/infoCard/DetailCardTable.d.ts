import type { SelectionKind } from '../../engine/SelectionKind';
import type { DetailCardEntry } from './DetailCardEntry';

/** The table `detailCardTable` builds and InfoCard dispatches on: one row per
 * `SelectionKind`, each typed to its own arm — the key is the narrowing proof. */
export type DetailCardTable = { readonly [K in SelectionKind]: DetailCardEntry<K> };
