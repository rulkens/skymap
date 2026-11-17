/**
 * What core and the store know of any selection row: its kind. A focusable kind's row is also a
 * `PlacedRow` and a camera-hosting one a `DrivenSelectionRow`; every other field is its Layer's.
 * Rows stay JSON-serializable, so the RTK serializability check stays on.
 */
export type SelectionRowBase = { readonly type: string };
