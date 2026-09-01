import type { RootState } from '../store/types';

/**
 * storeWriteIsDirty — did a store write change anything the frame loop draws, or
 * anything a user actually did (as opposed to the loop's own bookkeeping)? Both
 * render-on-demand's dirty flag and the interaction-priority boost trigger
 * (Viewport.tsx) share this one check. Every slice reducer returns a fresh object
 * only on a real change (createStore.ts's own docstring), so reference comparisons
 * are exact and free — except for the loop's own per-frame writes, excluded the same
 * way `view.fps` is: `sim.stepCount` (compared field-by-field, not by slice
 * reference — every OTHER `sim` field still counts) and the WHOLE `histogram` slice
 * (nothing in the canvas draw path reads it, and it churns every
 * HISTOGRAM_INTERVAL_STEPS regardless of any UI write — counting it very nearly
 * pins the interaction boost on for the whole time a sim is running, since a
 * running sim always has fresh histogram writes a few hundred ms apart).
 */
export function storeWriteIsDirty(prev: RootState, next: RootState): boolean {
  if (prev === next) return false;
  return (
    prev.catalog !== next.catalog ||
    prev.grid !== next.grid ||
    isSimMeaningfullyChanged(prev.sim, next.sim) ||
    prev.view.layers !== next.view.layers ||
    prev.view.galaxies !== next.view.galaxies ||
    prev.view.agents !== next.view.agents ||
    prev.view.camera !== next.view.camera ||
    prev.view.raymarch !== next.view.raymarch ||
    prev.view.pathTracer !== next.view.pathTracer
  );
}

function isSimMeaningfullyChanged(prev: RootState['sim'], next: RootState['sim']): boolean {
  if (prev === next) return false;
  return (
    prev.params !== next.params ||
    prev.agentCount !== next.agentCount ||
    prev.initMode !== next.initMode ||
    prev.running !== next.running ||
    prev.seed !== next.seed ||
    prev.resetToken !== next.resetToken ||
    prev.clearTraceToken !== next.clearTraceToken ||
    prev.exportToken !== next.exportToken ||
    prev.scfdToken !== next.scfdToken
  );
}
