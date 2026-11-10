import type { SelectionRefBase } from '../../engine/selection/SelectionRefBase';

/** A clip's focus from `atSec` on; `ref: null` is an explicit clear. */
export type FocusStep = { readonly atSec: number; readonly ref: SelectionRefBase | null };
