import type { SelectionRefBase } from './SelectionRefBase';

/** A slot's durable id, paired with the ref it was encoded from. */
export type SelectionAnchor = { readonly id: string; readonly ref: SelectionRefBase };
