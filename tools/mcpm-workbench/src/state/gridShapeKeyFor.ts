import type { AppState } from '../../@types/AppState';
import { gridShapeOf } from './gridShapeOf';

/** `gridShapeOf`'s fields, serialized — a change here restarts the pending-box preview timer
 *  (Viewport.tsx's `boxPreviewUntil`). "Auto fit" (fitBoxToCatalog) is covered for free: it's a
 *  one-shot write to manualCenterMpc/manualSizeMpc, not a field this key has to track separately. */
export function gridShapeKeyFor(s: AppState): unknown[] {
  return Object.values(gridShapeOf(s.grid));
}
