/**
 * timingSlotForView — names the GPU-timing slot (and the DebugPanel pass
 * toggle) a step bills to when drawn for a given view: the canvas keeps the
 * bare step name, every other view (a dome face later) appends
 * `@<view id>`. One rule so a rig with several views never bills two views
 * to one slot. Cubemap captures don't use it: each bills one slot for its
 * whole bake (`captureTimingSlotName`).
 */

export function timingSlotForView(base: string, viewId: string): string {
  return viewId === 'canvas' ? base : `${base}@${viewId}`;
}
