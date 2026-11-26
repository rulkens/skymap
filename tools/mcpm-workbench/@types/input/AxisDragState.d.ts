import type { GizmoDragState } from '../gizmo/GizmoDragState';

/** Narrows away GizmoDragState's rotate variant — nested on `handle.kind`, one level past
 *  what TS's discriminated-union narrowing follows automatically, so an explicit predicate
 *  earns its place here rather than a cast at each call site. */
export type AxisDragState = Extract<
  GizmoDragState,
  { readonly handle: { readonly kind: 'translate' | 'resize' } }
>;
