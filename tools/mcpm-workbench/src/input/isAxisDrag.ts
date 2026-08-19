import type { GizmoDragState } from '../../@types/GizmoDragState';

/** Narrows away GizmoDragState's rotate variant — nested on `handle.kind`, one level past
 *  what TS's discriminated-union narrowing follows automatically, so an explicit predicate
 *  earns its place here rather than a cast at each call site. */
export type AxisDragState = Extract<
  GizmoDragState,
  { readonly handle: { readonly kind: 'translate' | 'resize' } }
>;

export function isAxisDrag(drag: GizmoDragState): drag is AxisDragState {
  return drag.handle.kind !== 'rotate';
}
