/**
 * timingSlotForView — names the GPU-timing slot (and the DebugPanel pass
 * toggle) a step bills to when drawn for a given view: the canvas keeps the
 * bare step name, every other view (a cubemap capture face today, a dome
 * face later) appends `@<view id>`, e.g. `hdr·COSMO@sgrAStar:3`. One rule so
 * a rig with several views never bills two views to one slot and the
 * timings panel can fold a capture's six faces back onto one row.
 */

export function timingSlotForView(base: string, viewId: string): string {
  return viewId === 'canvas' ? base : `${base}@${viewId}`;
}
