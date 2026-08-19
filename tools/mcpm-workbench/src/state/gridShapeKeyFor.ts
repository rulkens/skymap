import type { AppState } from '../../@types/AppState';

/** The five fields that reshape the grid box — a change here restarts the pending-box preview
 *  timer (Viewport.tsx's `boxPreviewUntil`). "Auto fit" (fitBoxToCatalog) is covered for free:
 *  it's a one-shot write to manualCenterMpc/manualSizeMpc, not a sixth field this key has to
 *  track. `manualRotation` (F2.5) belongs here for the same reason it belongs in `buildKey` —
 *  a rotate drag reshapes the box exactly as a translate/resize drag does. */
export function gridShapeKeyFor(s: AppState): unknown[] {
  return [
    s.grid.manualCenterMpc,
    s.grid.manualSizeMpc,
    s.grid.manualRotation,
    s.grid.manualVoxelSizeMpc,
    s.grid.paddingMpc,
  ];
}
