import type { RootState } from '../store/types';

/**
 * storeWriteIsDirty — did a store write change anything the frame loop draws,
 * or anything a user actually did (as opposed to the loop's own bookkeeping)?
 * Render-on-demand's dirty flag and the interaction-priority boost trigger
 * share this one check. Immer only produces a fresh object on a real change,
 * so reference comparisons are exact and free — except the loop's own
 * per-frame writes, excluded the same way as `view.fps`: `sim.stepCount`
 * (field-by-field, every OTHER `sim` field still counts by reference) and the
 * WHOLE `histogram` slice (nothing in the canvas draw path reads it, and
 * counting its churn would pin the interaction boost on for the whole time a
 * sim is running).
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
    prev.seed !== next.seed
  );
}
