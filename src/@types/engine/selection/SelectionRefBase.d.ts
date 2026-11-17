/**
 * What core and the store know of any selection ref: its kind, over flat primitive fields. The
 * index signature holds every ref to that shape: the RTK `selection` slice keeps its
 * serializability check on, and `refKey` keys a ref by its field values.
 */
export type SelectionRefBase = { readonly type: string; readonly [field: string]: string | number };
