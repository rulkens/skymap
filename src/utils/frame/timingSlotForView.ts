/**
 * timingSlotForView — the one GPU-timing/toggle suffix rule: the canvas gets
 * the bare name, every other view (a capture face today, a dome face later)
 * gets `@<view id>` appended — replacing the capture-only per-face suffix
 * `slabs.ts` used to hand-roll.
 */

export function timingSlotForView(base: string, viewId: string): string {
  return viewId === 'canvas' ? base : `${base}@${viewId}`;
}
